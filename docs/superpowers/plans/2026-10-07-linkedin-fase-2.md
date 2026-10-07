# LinkedIn phase 2 (direct posting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coni connects her LinkedIn profile once in Ajustes. At the approved time, the publish cron uploads the approved video and posts the approved LinkedIn text on her profile, marks the row `publicado` with its permalink, and never posts twice. Anything that goes wrong falls back to phase 1's manual upload, with a reason.

**Architecture:** An OAuth 2.0 authorization-code flow (`/api/linkedin/conectar`, `/api/linkedin/callback`) stores the 60-day token in Vault (`linkedin`) and the member URN and expiry in `ajustes`. The `linkedin` row of `publicaciones` gains per-row publishing state (`video_urn`, `enviado_en`, `post_urn`, `intentos`, `explicacion`). `resolverLinkedin` runs first inside `procesar` of `lib/publicacion/publicar.ts`. It is a resumable sequence: upload, poll, re-check the gate, reserve with the version lock, then post. Its outcome feeds the existing single state machine. Spec: `docs/superpowers/specs/2026-10-07-conidolly-linkedin-fase-2-design.md`. Decisions L1 to L11 and API facts F1 to F18 are referenced below.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (Postgres + RLS + Vault, local for `test:db`), Trigger.dev v4, Vitest + Testing Library + MSW 2, Biome (safe mode), Calma suiza components (`components/ui/*`) and tokens (`app/globals.css`).

---

## 0. Rules for every task

- TDD: write the failing test first, run it red, write the minimal code, run it green, commit. One task = one commit.
- Commit messages end with a blank line and then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- UI copy is es-CL, tú, with no em dashes (`grep -n "—" <files>` must come back empty). Use only `components/ui/*`
  and the semantic token classes (`text-apagado`, `text-exito`, `text-aviso`, `text-error`, `text-cuerpo`,
  `text-meta`, `border-linea`). No hex, no new colors.
- **No real API calls.** Every LinkedIn call goes through MSW (`tests/msw.ts` runs with `onUnhandledRequest: "error"`).
  The handlers live in `tests/linkedin-msw.ts` (Task 5).
- Run the whole gate after any data or config change: `pnpm test:run && pnpm test:db && pnpm type && pnpm lint`.
- `biome check --write` (safe) only, never `--unsafe`. After editing a client file, check that line 1 is still
  `"use client"`.
- Never run `supabase db push` from the agent. Local database only (`pnpm db:reset`). After each migration, run
  `pnpm db:types`.
- Never read, print or write real keys. Tests use fake values such as `AQV_token_de_prueba`.
- `lib/dominio/` stays pure: no network, no database, and the clock comes in as a parameter.

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20261007000100_linkedin_conexion.sql` | `ajustes` LinkedIn columns, `conectar_linkedin`, `desconectar_linkedin`, `linkedin_conectado()`, notice type `linkedin_por_vencer` |
| `supabase/migrations/20261007000110_linkedin_publicacion.sql` | `publicaciones` columns and checks, `reservar_envio_linkedin`, `marcar_subido_como_coni` (+`linkedin_se_publica_solo`), `sincronizar_publicaciones` (keeps rows in flight), `proteger_pieza` (system `publicado_a_mano`) |
| `lib/dominio/linkedin.ts` (new) | little text, permalink, URN checks, next step of the row, expiry thresholds, version age |
| `lib/dominio/estados.ts` | event `publicado` with `algunoAMano` |
| `lib/acciones/estado-oauth.ts` (new) | `nuevoEstado`, `estadoCoincide` (moved from `instagram.ts`) |
| `lib/proveedores/linkedin-oauth.ts` (new) | authorization URL, code exchange, userinfo |
| `lib/proveedores/linkedin.ts` (new) | Videos API, Posts API, error classes, `VERSION_DE_LINKEDIN` |
| `lib/acciones/linkedin.ts`, `lib/acciones/linkedin-cookie.ts` (new) | `leerAppDeLinkedin`, `terminarConexionLinkedin`, `desconectarLinkedin`, cookie |
| `app/api/linkedin/conectar/route.ts`, `app/api/linkedin/callback/route.ts` (new) | OAuth routes |
| `lib/ajustes/estado.ts`, `revisar.ts`, `presentar.ts`, `linkedin-aviso.ts` (new) | LinkedIn in the status block and rows |
| `app/(app)/ajustes/cuentas-conectadas.tsx`, `cuentas/page.tsx`, `acciones.ts`, `editor-de-ajustes.tsx`, `page.tsx` | LinkedIn row, disconnect, "Sale solo" |
| `lib/datos/repositorio.ts` | LinkedIn connection and row reads and writes |
| `lib/publicacion/linkedin.ts` (new) | `resolverLinkedin` |
| `lib/publicacion/publicar.ts` | orchestration (L7) |
| `lib/mantenimiento/token-linkedin.ts` (new), `ejecutar.ts` | nightly expiry notices, version alert |
| `lib/avisos/tipos.ts` | `linkedin_por_vencer` |
| `app/(app)/video/[id]/*` | auto state, permalink, fallback reason |
| `lib/produccion/deps-reales.ts`, `trigger/publicar-pendientes.ts`, `.env.example` | wiring |
| `tests/linkedin-msw.ts` (new) | the fake LinkedIn |

---

### Task 1: Connection schema (L3, L4 notice type)

**Files:**
- Create: `supabase/migrations/20261007000100_linkedin_conexion.sql`
- Modify: `lib/avisos/tipos.ts`
- Test: `tests/integration/linkedin-conexion-esquema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

const MIEMBRO = "urn:li:person:abc123XYZ"
const EXPIRA = "2031-01-01T00:00:00.000Z"

let coni: Awaited<ReturnType<typeof clienteDeConi>>
let mantenedor: Awaited<ReturnType<typeof clienteDelMantenedor>>

beforeAll(async () => {
  coni = await clienteDeConi()
  mantenedor = await clienteDelMantenedor()
})

afterEach(async () => {
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})

afterAll(() => pool.end())

async function secreto(): Promise<string | null> {
  const { rows } = await pool.query<{ decrypted_secret: string }>(
    "select decrypted_secret from vault.decrypted_secrets where name = 'linkedin'",
  )
  return rows[0]?.decrypted_secret ?? null
}

describe("conectar_linkedin", () => {
  it("saves the token in Vault and the member, name and expiry in ajustes in one call", async () => {
    const { error } = await coni.rpc("conectar_linkedin", {
      p_token: "AQV_token_de_prueba",
      p_miembro: MIEMBRO,
      p_nombre: "Coni del Rosario",
      p_expira_en: EXPIRA,
    })
    expect(error).toBeNull()
    expect(await secreto()).toBe("AQV_token_de_prueba")
    const { rows } = await pool.query(
      "select linkedin_miembro, linkedin_nombre, linkedin_token_expira_en, linkedin_conectado_en from public.ajustes",
    )
    expect(rows[0]).toMatchObject({ linkedin_miembro: MIEMBRO, linkedin_nombre: "Coni del Rosario" })
    expect(rows[0].linkedin_conectado_en).not.toBeNull()
  })

  it("refuses anyone but Coni", async () => {
    const { error } = await mantenedor.rpc("conectar_linkedin", {
      p_token: "AQV_token_de_prueba",
      p_miembro: MIEMBRO,
      p_nombre: null,
      p_expira_en: EXPIRA,
    })
    expect(error?.message).toMatch(/solo_coni_conecta_linkedin/)
    expect(await secreto()).toBeNull()
  })

  it("refuses a member that is not a person URN", async () => {
    const { error } = await coni.rpc("conectar_linkedin", {
      p_token: "AQV_token_de_prueba",
      p_miembro: "urn:li:organization:1",
      p_nombre: null,
      p_expira_en: EXPIRA,
    })
    expect(error?.message).toMatch(/miembro_invalido/)
  })

  it("does not let guardar_secreto write the linkedin token", async () => {
    const { error } = await coni.rpc("guardar_secreto", { p_nombre: "linkedin", p_valor: "pegada" })
    expect(error?.message).toMatch(/cuenta_desconocida/)
  })
})

describe("desconectar_linkedin and linkedin_conectado", () => {
  it("reports connected only with a member and an expiry in the future", async () => {
    await coni.rpc("conectar_linkedin", {
      p_token: "AQV_token_de_prueba",
      p_miembro: MIEMBRO,
      p_nombre: null,
      p_expira_en: EXPIRA,
    })
    expect((await pool.query("select public.linkedin_conectado() as si")).rows[0].si).toBe(true)
    await pool.query("update public.ajustes set linkedin_token_expira_en = now() - interval '1 minute'")
    expect((await pool.query("select public.linkedin_conectado() as si")).rows[0].si).toBe(false)
  })

  it("deletes the token and clears the columns when Coni disconnects", async () => {
    await coni.rpc("conectar_linkedin", {
      p_token: "AQV_token_de_prueba",
      p_miembro: MIEMBRO,
      p_nombre: "Coni",
      p_expira_en: EXPIRA,
    })
    const { error } = await coni.rpc("desconectar_linkedin")
    expect(error).toBeNull()
    expect(await secreto()).toBeNull()
    const { rows } = await pool.query("select linkedin_miembro, linkedin_token_expira_en from public.ajustes")
    expect(rows[0]).toEqual({ linkedin_miembro: null, linkedin_token_expira_en: null })
  })

  it("refuses a half-saved connection in ajustes", async () => {
    await expect(pool.query("update public.ajustes set linkedin_miembro = 'urn:li:person:x'")).rejects.toThrow(
      /linkedin_completo/,
    )
  })

  it("accepts the linkedin_por_vencer notice type", async () => {
    await expect(
      pool.query(
        "insert into public.avisos (tipo, clave, mensaje) values ('linkedin_por_vencer', 'prueba:linkedin', 'x')",
      ),
    ).resolves.toBeDefined()
    await pool.query("delete from public.avisos where clave = 'prueba:linkedin'")
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm db:reset && pnpm test:db tests/integration/linkedin-conexion-esquema.test.ts`
Expected: FAIL with `function public.conectar_linkedin(...) does not exist` and `column "linkedin_miembro" ... does not exist`.

- [ ] **Step 3: Write the migration**

```sql
-- LinkedIn phase 2 (design 2026-10-07, L3, L4): Coni connects her profile with OAuth. The token goes into Vault and the
-- member, the name and the expiry into `ajustes`, in one transaction, so a connection is never half saved.
alter table public.ajustes
  add column linkedin_miembro text,
  add column linkedin_nombre text,
  add column linkedin_token_expira_en timestamptz,
  add column linkedin_conectado_en timestamptz,
  add constraint linkedin_completo check (
    (linkedin_miembro is null) = (linkedin_token_expira_en is null)
    and (linkedin_miembro is null) = (linkedin_conectado_en is null)
  ),
  add constraint linkedin_miembro_es_persona check (
    linkedin_miembro is null or linkedin_miembro ~ '^urn:li:person:[A-Za-z0-9_-]+$'
  );

create function public.conectar_linkedin(p_token text, p_miembro text, p_nombre text, p_expira_en timestamptz)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_conecta_linkedin';
  end if;
  if nullif(btrim(p_token), '') is null or p_expira_en is null then
    raise exception using errcode = '22023', message = 'conexion_incompleta';
  end if;
  if p_miembro is null or p_miembro !~ '^urn:li:person:[A-Za-z0-9_-]+$' then
    raise exception using errcode = '22023', message = 'miembro_invalido';
  end if;
  select id into v_id from vault.secrets where name = 'linkedin';
  if found then
    perform vault.update_secret(v_id, btrim(p_token));
  else
    perform vault.create_secret(btrim(p_token), 'linkedin');
  end if;
  update public.ajustes
     set linkedin_miembro = p_miembro,
         linkedin_nombre = nullif(btrim(p_nombre), ''),
         linkedin_token_expira_en = p_expira_en,
         linkedin_conectado_en = now()
   where id;
end $$;

-- There is no revoke endpoint in LinkedIn's docs (F13): disconnecting forgets our copy.
create function public.desconectar_linkedin() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_desconecta_linkedin';
  end if;
  delete from vault.secrets where name = 'linkedin';
  update public.ajustes
     set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null
   where id;
end $$;

-- Used by marcar_subido_como_coni: while this is true a waiting LinkedIn row goes out by itself.
create function public.linkedin_conectado() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.ajustes where linkedin_miembro is not null and linkedin_token_expira_en > now()
  )
$$;

revoke execute on function public.conectar_linkedin(text, text, text, timestamptz) from public, anon;
grant execute on function public.conectar_linkedin(text, text, text, timestamptz) to authenticated;
revoke execute on function public.desconectar_linkedin() from public, anon;
grant execute on function public.desconectar_linkedin() to authenticated;
revoke execute on function public.linkedin_conectado() from public, anon;
grant execute on function public.linkedin_conectado() to authenticated, service_role;

-- `linkedin_por_vencer`: the 60-day token has no refresh for a self-serve app (F12); Coni renews it from Ajustes.
alter table public.avisos drop constraint avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check check (tipo in (
  'ideas_propuestas', 'guion_listo', 'video_listo', 'error_definitivo', 'publicado', 'tope_alcanzado',
  'instagram_por_vencer', 'recordatorio_48h', 'listo_para_subir', 'linkedin_por_vencer'
));
```

`guardar_secreto` already refuses any name outside `('heygen','elevenlabs','anthropic','meta','metricool')`, so
`linkedin` is refused with `cuenta_desconocida` without any change.

- [ ] **Step 4: Add the notice type in TypeScript**

In `lib/avisos/tipos.ts`, add `"linkedin_por_vencer"` to `TIPOS_DE_AVISO` after `"listo_para_subir"`, and add this
entry to `CUERPO_DE_PUSH`:

```ts
  linkedin_por_vencer: "Tu conexión con LinkedIn necesita atención",
```

- [ ] **Step 5: Run the tests and the types**

Run: `pnpm db:reset && pnpm db:types && pnpm test:db tests/integration/linkedin-conexion-esquema.test.ts tests/integration/avisos-esquema.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261007000100_linkedin_conexion.sql lib/supabase/database.types.ts lib/avisos/tipos.ts tests/integration/linkedin-conexion-esquema.test.ts
git commit -m "$(printf 'Agrega la conexión de LinkedIn en Vault y ajustes\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 2: Publishing schema (L5)

**Files:**
- Create: `supabase/migrations/20261007000110_linkedin_publicacion.sql`
- Test: `tests/integration/linkedin-publicacion-esquema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { hashTextoDePuerta2 } from "@/lib/dominio/puertas"
import { comoConi, pool } from "./db"
import { aplicar, crearPiezaEn, TEXTO, VIDEO } from "./flujo"
import { clienteDeConi } from "./sesion-coni"
import { publicacionesDe } from "./siembra"

const LINKEDIN = "Texto para LinkedIn.\n\nEste video lo narra mi avatar digital."
const creadas: string[] = []

afterEach(async () => {
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [creadas])
  creadas.length = 0
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})
afterAll(() => pool.end())

async function programadaConLinkedin(): Promise<string> {
  const c = await pool.connect()
  try {
    await c.query("begin")
    const destinos = ["linkedin"] as const
    const id = await crearPiezaEn(c, "video_por_aprobar", { destinos, textoLinkedin: LINKEDIN })
    const hash = hashTextoDePuerta2(2, { texto: TEXTO, textoLinkedin: LINKEDIN, destinos })
    await aplicar(
      c,
      id,
      comoConi,
      {
        tipo: "aprobar_video",
        actor: "coni",
        videoVisto: VIDEO,
        hashTextoVisto: hash,
        hashTextoActual: hash,
        formula: 2,
        publicarEn: "2031-03-14T22:00:00.000Z",
        en: new Date().toISOString(),
      },
      { destinos: [...destinos] },
    )
    await c.query("commit")
    creadas.push(id)
    return id
  } finally {
    c.release()
  }
}

async function version(id: string): Promise<number> {
  return (await pool.query<{ version: number }>("select version from public.piezas where id = $1", [id])).rows[0]
    .version
}

describe("publicaciones for LinkedIn", () => {
  it("refuses a published LinkedIn row without a post URN", async () => {
    const id = await programadaConLinkedin()
    await expect(
      pool.query("update public.publicaciones set estado = 'publicado' where pieza_id = $1 and destino = 'linkedin'", [
        id,
      ]),
    ).rejects.toThrow(/linkedin_publicado_con_urn/)
  })

  it("refuses a post URN that is not a share or a ugcPost", async () => {
    const id = await programadaConLinkedin()
    await expect(
      pool.query("update public.publicaciones set post_urn = 'urn:li:video:1' where pieza_id = $1", [id]),
    ).rejects.toThrow(/post_urn_es_de_post/)
  })
})

describe("reservar_envio_linkedin", () => {
  it("marks the row as sent and bumps the piece version once", async () => {
    const id = await programadaConLinkedin()
    await pool.query("update public.publicaciones set video_urn = 'urn:li:video:C1' where pieza_id = $1", [id])
    const antes = await version(id)
    const { rows } = await pool.query<{ v: number }>("select public.reservar_envio_linkedin($1, $2) as v", [id, antes])
    expect(rows[0].v).toBe(antes + 1)
    const [fila] = await publicacionesDe(id)
    expect(fila.enviado_en).not.toBeNull()
    await expect(pool.query("select public.reservar_envio_linkedin($1, $2)", [id, antes + 1])).rejects.toThrow(
      /linkedin_no_espera/,
    )
  })

  it("refuses an old version", async () => {
    const id = await programadaConLinkedin()
    await pool.query("update public.publicaciones set video_urn = 'urn:li:video:C1' where pieza_id = $1", [id])
    await expect(pool.query("select public.reservar_envio_linkedin($1, $2)", [id, 0])).rejects.toThrow(
      /version_desfasada/,
    )
  })

  it("refuses without an uploaded video", async () => {
    const id = await programadaConLinkedin()
    await expect(pool.query("select public.reservar_envio_linkedin($1, $2)", [id, await version(id)])).rejects.toThrow(
      /linkedin_no_espera/,
    )
  })

  it("is not callable by Coni's session", async () => {
    const id = await programadaConLinkedin()
    const coni = await clienteDeConi()
    const { error } = await coni.rpc("reservar_envio_linkedin", { p_pieza: id, p_version: await version(id) })
    expect(error).not.toBeNull()
  })
})

describe("marcar_subido_como_coni with LinkedIn connected", () => {
  it("refuses an early manual mark of a waiting LinkedIn row while LinkedIn is connected", async () => {
    const id = await programadaConLinkedin()
    await pool.query(
      "update public.ajustes set linkedin_miembro = 'urn:li:person:x', linkedin_token_expira_en = now() + interval '30 days', linkedin_conectado_en = now()",
    )
    const coni = await clienteDeConi()
    const { error } = await coni.rpc("marcar_subido_como_coni", {
      p_pieza: id,
      p_version: await version(id),
      p_destino: "linkedin",
      p_enlace: "",
    })
    expect(error?.message).toMatch(/linkedin_se_publica_solo/)
  })

  it("lets her mark it once the row fell back to para_subir", async () => {
    const id = await programadaConLinkedin()
    await pool.query(
      "update public.ajustes set linkedin_miembro = 'urn:li:person:x', linkedin_token_expira_en = now() + interval '30 days', linkedin_conectado_en = now()",
    )
    await pool.query("update public.publicaciones set estado = 'para_subir', explicacion = 'x' where pieza_id = $1", [
      id,
    ])
    const coni = await clienteDeConi()
    const { error } = await coni.rpc("marcar_subido_como_coni", {
      p_pieza: id,
      p_version: await version(id),
      p_destino: "linkedin",
      p_enlace: "",
    })
    expect(error).toBeNull()
  })
})

describe("sincronizar_publicaciones keeps a row in flight", () => {
  it("does not delete a sent LinkedIn row when gate 2 is taken back", async () => {
    const id = await programadaConLinkedin()
    await pool.query(
      "update public.publicaciones set video_urn = 'urn:li:video:C1', enviado_en = now() where pieza_id = $1",
      [id],
    )
    const c = await pool.connect()
    try {
      await aplicar(c, id, comoConi, { tipo: "cambiar_fecha" })
    } finally {
      c.release()
    }
    const filas = await publicacionesDe(id)
    expect(filas).toHaveLength(1)
    expect(filas[0].enviado_en).not.toBeNull()
  })
})

describe("proteger_pieza lets the system close a mixed piece", () => {
  it("allows programado -> publicado_a_mano by the service role when nothing is pending", async () => {
    const id = await programadaConLinkedin()
    await pool.query(
      "update public.publicaciones set estado = 'publicado', post_urn = 'urn:li:share:1', enviado_en = now(), video_urn = 'urn:li:video:C1' where pieza_id = $1",
      [id],
    )
    const v = await version(id)
    await expect(
      pool.query("update public.piezas set estado = 'publicado_a_mano', version = $2 where id = $1", [id, v + 1]),
    ).resolves.toBeDefined()
  })

  it("still refuses it while a row is pending", async () => {
    const id = await programadaConLinkedin()
    const v = await version(id)
    await expect(
      pool.query("update public.piezas set estado = 'publicado_a_mano', version = $2 where id = $1", [id, v + 1]),
    ).rejects.toThrow(/solo_coni_entra_a_puerta/)
  })
})
```

Note: `pool` connects as the database owner (`postgres`), for which `es_coni()` is false, exactly like the service
role in the trigger checks. `publicacionesDe` (in `tests/integration/siembra.ts`) must select the new columns: change
its `select` to `select *`.

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test:db tests/integration/linkedin-publicacion-esquema.test.ts`
Expected: FAIL with `column "post_urn" ... does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261007000110_linkedin_publicacion.sql`. It redefines three functions. Copy each from the
migration named in its comment and apply only the marked changes. The full bodies are written out below.

```sql
-- LinkedIn phase 2 (design 2026-10-07, L5, L6, L7): per-row publishing state for the LinkedIn row.
alter table public.publicaciones
  add column video_urn text,
  add column enviado_en timestamptz,
  add column post_urn text,
  add column hash_enviado text,
  add column intentos smallint not null default 0,
  add column explicacion text,
  add column ultimo_error text,
  add constraint linkedin_publicado_con_urn check (destino <> 'linkedin' or estado <> 'publicado' or post_urn is not null),
  add constraint post_urn_es_de_post check (post_urn is null or post_urn ~ '^urn:li:(share|ugcPost):[0-9]+$'),
  add constraint intentos_no_negativos check (intentos >= 0);

-- Right before POST /rest/posts: one transaction locks the piece, checks the version the run holds, marks the row as
-- sent and bumps the version. From here on the post is never sent again (L10).
create function public.reservar_envio_linkedin(p_pieza uuid, p_version integer) returns integer
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
     and video_urn is not null and enviado_en is null and post_urn is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'linkedin_no_espera';
  end if;
  update public.piezas set version = version + 1 where id = p_pieza returning version into v_nueva;
  return v_nueva;
end $$;

revoke execute on function public.reservar_envio_linkedin(uuid, integer) from public, anon, authenticated;
grant execute on function public.reservar_envio_linkedin(uuid, integer) to service_role;
```

Then `create or replace function public.marcar_subido_como_coni(...)`: copy the body from
`20261006000110_destinos_funciones.sql` lines 57 to 108 verbatim, and insert this block right after the
`instagram_se_publica_solo` block:

```sql
  -- A connected LinkedIn posts by itself at the approved time (design 2026-10-07, L5). Once its row fell back to
  -- `para_subir` it is hers again.
  if p_destino = 'linkedin' and public.linkedin_conectado()
     and exists (select 1 from public.publicaciones
                  where pieza_id = p_pieza and destino = 'linkedin' and estado = 'esperando') then
    raise exception using errcode = 'P0001', message = 'linkedin_se_publica_solo';
  end if;
```

Then `create or replace function public.sincronizar_publicaciones()`: copy the body from
`20261006000110_destinos_funciones.sql` lines 122 to 166 verbatim, with two changes:

1. In the approval branch, the `on conflict ... do update ... where` clause becomes:

```sql
        where public.publicaciones.estado in ('esperando', 'para_subir')
          and public.publicaciones.enviado_en is null and public.publicaciones.post_urn is null;
```

2. In the take-back branch, the `delete` becomes:

```sql
    -- A LinkedIn row that was sent (or may have been) stays: a post that may be live is never forgotten.
    delete from public.publicaciones
     where pieza_id = new.id and estado in ('esperando', 'para_subir')
       and enviado_en is null and post_urn is null;
```

Then `create or replace function public.proteger_pieza()`: copy the body from `20261006000100_destinos.sql` (the
whole function, lines from `create or replace function public.proteger_pieza()` to `end $function$;`), and replace
the `solo_coni_entra_a_puerta` block with:

```sql
  if new.estado in ('grabando_voz', 'en_render', 'programado', 'publicado_a_mano')
     and new.estado is distinct from old.estado and not public.es_coni() then
    -- The publish task may close a mixed piece (one destination by hand, the last one automatic: L7) only when
    -- nothing is left to upload.
    if not (new.estado = 'publicado_a_mano' and old.estado = 'programado'
            and not exists (select 1 from public.publicaciones
                             where pieza_id = new.id and estado in ('esperando', 'para_subir'))) then
      raise exception using errcode = '42501', message = 'solo_coni_entra_a_puerta';
    end if;
  end if;
```

- [ ] **Step 4: Run the tests**

Run: `pnpm db:reset && pnpm db:types && pnpm test:db tests/integration/linkedin-publicacion-esquema.test.ts tests/integration/destinos-funciones.test.ts tests/integration/destinos-esquema.test.ts tests/integration/subir-a-mano-esquema.test.ts`
Expected: PASS (the phase 1 tests prove the copied bodies are unchanged).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261007000110_linkedin_publicacion.sql lib/supabase/database.types.ts tests/integration/linkedin-publicacion-esquema.test.ts tests/integration/siembra.ts
git commit -m "$(printf 'Agrega el estado de publicación de LinkedIn por destino\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 3: LinkedIn domain (little text, permalink, next step, expiry, version)

**Files:**
- Create: `lib/dominio/linkedin.ts`
- Test: `tests/unit/linkedin-dominio.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  aLittleText,
  avisoDeVencimientoLinkedin,
  enlaceDePost,
  esUrnDePost,
  MAXIMO_DE_INTENTOS_LINKEDIN,
  siguientePasoLinkedin,
  versionDeLinkedinPorVencer,
} from "@/lib/dominio/linkedin"

/** The oracle: what LinkedIn shows for a little text (F8). Only for tests. */
function desdeLittleText(little: string): string {
  return little.replace(/\{hashtag\|\\#\|((?:\\.|[^}\\])*)\}/g, "#$1").replace(/\\(.)/g, "$1")
}

const APROBADO = `¿Te cuesta poner límites (incluso con tu familia)?

Hoy: 3 ideas *simples* para empezar_ya. Escríbeme @ tu colegio <3 ~ [nota] {llaves} | barra \\ final

Este video lo narra mi avatar digital, creado con IA a partir de mi imagen y mi voz. El contenido lo revisé y aprobé yo.

#SaludMental #límites #crianza_respetuosa`

describe("aLittleText", () => {
  it("handles every reserved character when the text has them: LinkedIn shows exactly the approved text", () => {
    expect(desdeLittleText(aLittleText(APROBADO))).toBe(APROBADO)
  })

  it("turns each hashtag into the hashtag template so it stays a hashtag", () => {
    const little = aLittleText("Hola\n\n#SaludMental #límites")
    expect(little).toBe("Hola\n\n{hashtag|\\#|SaludMental} {hashtag|\\#|límites}")
  })

  it("escapes a # that is not a hashtag", () => {
    expect(aLittleText("el #1 y # solo")).toBe("el {hashtag|\\#|1} y \\# solo")
  })

  it("leaves accents, ñ, emojis and line breaks untouched", () => {
    expect(aLittleText("Niñez 🌱\nañadir")).toBe("Niñez 🌱\nañadir")
  })
})

describe("enlaceDePost and esUrnDePost", () => {
  it("builds the feed permalink from a share or ugcPost URN", () => {
    expect(enlaceDePost("urn:li:share:7123")).toBe("https://www.linkedin.com/feed/update/urn:li:share:7123/")
    expect(enlaceDePost("urn:li:ugcPost:99")).toBe("https://www.linkedin.com/feed/update/urn:li:ugcPost:99/")
  })

  it("accepts only post URNs", () => {
    expect(esUrnDePost("urn:li:share:1")).toBe(true)
    expect(esUrnDePost("urn:li:ugcPost:1")).toBe(true)
    expect(esUrnDePost("urn:li:video:C1")).toBe(false)
    expect(esUrnDePost("")).toBe(false)
  })
})

describe("siguientePasoLinkedin", () => {
  const base = { estado: "esperando" as const, videoUrn: null, enviadoEn: null, postUrn: null, intentos: 0 }

  it("does nothing for a row that is not waiting or already has its post", () => {
    expect(siguientePasoLinkedin({ ...base, estado: "para_subir" })).toEqual({ tipo: "nada" })
    expect(siguientePasoLinkedin({ ...base, postUrn: "urn:li:share:1" })).toEqual({ tipo: "nada" })
  })

  it("is in doubt when a send was reserved and no post came back", () => {
    expect(siguientePasoLinkedin({ ...base, videoUrn: "v", enviadoEn: "2031-01-01T00:00:00Z" })).toEqual({
      tipo: "dudosa",
    })
  })

  it("gives up to manual after the maximum of tries", () => {
    expect(siguientePasoLinkedin({ ...base, intentos: MAXIMO_DE_INTENTOS_LINKEDIN })).toEqual({ tipo: "a_mano" })
  })

  it("uploads first, then waits for the video", () => {
    expect(siguientePasoLinkedin(base)).toEqual({ tipo: "subir_video" })
    expect(siguientePasoLinkedin({ ...base, videoUrn: "urn:li:video:C1" })).toEqual({ tipo: "esperar_video" })
  })
})

describe("avisoDeVencimientoLinkedin", () => {
  const AHORA = Date.parse("2031-01-01T12:00:00Z")
  const DIA = 86_400_000
  it("says nothing with more than 14 days left", () => {
    expect(avisoDeVencimientoLinkedin(AHORA + 15 * DIA, AHORA)).toBeNull()
  })
  it("warns at 14, at 3 and when expired, with the days left", () => {
    expect(avisoDeVencimientoLinkedin(AHORA + 14 * DIA, AHORA)).toEqual({ umbral: 14, dias: 14 })
    expect(avisoDeVencimientoLinkedin(AHORA + 2.5 * DIA, AHORA)).toEqual({ umbral: 3, dias: 3 })
    expect(avisoDeVencimientoLinkedin(AHORA - 1, AHORA)).toEqual({ umbral: 0, dias: 0 })
  })
})

describe("versionDeLinkedinPorVencer", () => {
  it("is due when the version is 10 months old or more", () => {
    expect(versionDeLinkedinPorVencer("202609", "2027-06-30T00:00:00Z")).toBe(false)
    expect(versionDeLinkedinPorVencer("202609", "2027-07-01T00:00:00Z")).toBe(true)
  })
  it("refuses a version that is not YYYYMM", () => {
    expect(() => versionDeLinkedinPorVencer("2026-09", "2027-01-01T00:00:00Z")).toThrow()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test:run tests/unit/linkedin-dominio.test.ts`
Expected: FAIL with `Cannot find module '@/lib/dominio/linkedin'`.

- [ ] **Step 3: Write the implementation**

```ts
import type { EstadoDePublicacion } from "@/lib/dominio/destinos"

/** "little" text (F8): every reserved character is escaped with a backslash, even outside an element. */
const RESERVADOS = /[|{}@[\]()<>#\\*_~]/g
/** A hashtag starts a word: `#` right after the start or a blank, followed by letters, digits or `_`. */
const HASHTAG = /(^|\s)#([\p{L}\p{N}_]+)/gu

function escapar(texto: string): string {
  return texto.replace(RESERVADOS, (caracter) => `\\${caracter}`)
}

/** The approved text as LinkedIn's `commentary`: shown exactly as approved, with its hashtags still hashtags. */
export function aLittleText(texto: string): string {
  let salida = ""
  let desde = 0
  for (const encontrado of texto.matchAll(HASHTAG)) {
    const inicio = (encontrado.index ?? 0) + (encontrado[1]?.length ?? 0)
    const etiqueta = encontrado[2] ?? ""
    salida += `${escapar(texto.slice(desde, inicio))}{hashtag|\\#|${escapar(etiqueta)}}`
    desde = inicio + 1 + etiqueta.length
  }
  return salida + escapar(texto.slice(desde))
}

const URN_DE_POST = /^urn:li:(share|ugcPost):[0-9]+$/

export function esUrnDePost(urn: string): boolean {
  return URN_DE_POST.test(urn)
}

/** The feed permalink (F9). */
export function enlaceDePost(urn: string): string {
  if (!esUrnDePost(urn)) throw new Error(`No es un post de LinkedIn: ${urn}`)
  return `https://www.linkedin.com/feed/update/${urn}/`
}

/** Failed tries (temporary errors, failed processing) before the row goes to manual. */
export const MAXIMO_DE_INTENTOS_LINKEDIN = 3

export interface FilaDeLinkedin {
  estado: EstadoDePublicacion
  videoUrn: string | null
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

/** Where a LinkedIn row is, read from its columns alone (L6, L10). A sent row without a post is never sent again. */
export function siguientePasoLinkedin(fila: FilaDeLinkedin): PasoLinkedin {
  if (fila.estado !== "esperando" || fila.postUrn !== null) return { tipo: "nada" }
  if (fila.enviadoEn !== null) return { tipo: "dudosa" }
  if (fila.intentos >= MAXIMO_DE_INTENTOS_LINKEDIN) return { tipo: "a_mano" }
  if (fila.videoUrn === null) return { tipo: "subir_video" }
  return { tipo: "esperar_video" }
}

const DIA_MS = 86_400_000

/** The thresholds of L4: 14 days, 3 days, expired (0). `dias` rounds up, as Coni reads it. */
export function avisoDeVencimientoLinkedin(
  expiraEn: number,
  ahora: number,
): { umbral: 14 | 3 | 0; dias: number } | null {
  const restante = expiraEn - ahora
  if (restante <= 0) return { umbral: 0, dias: 0 }
  const dias = Math.ceil(restante / DIA_MS)
  if (dias <= 3) return { umbral: 3, dias }
  if (dias <= 14) return { umbral: 14, dias }
  return null
}

/** Each version lives at least one year (F4); WAV is told two months before. */
export function versionDeLinkedinPorVencer(version: string, ahora: string): boolean {
  const partes = /^(\d{4})(0[1-9]|1[0-2])$/.exec(version)
  if (!partes) throw new Error(`Versión de LinkedIn inválida: ${version}`)
  const fecha = new Date(ahora)
  const meses = (fecha.getUTCFullYear() - Number(partes[1])) * 12 + (fecha.getUTCMonth() + 1 - Number(partes[2]))
  return meses >= 10
}
```

- [ ] **Step 4: Run it**

Run: `pnpm test:run tests/unit/linkedin-dominio.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/linkedin.ts tests/unit/linkedin-dominio.test.ts
git commit -m "$(printf 'Agrega el dominio de LinkedIn: texto little, enlace y próximo paso\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 4: State machine, `publicado` with `algunoAMano` (L7)

**Files:**
- Modify: `lib/dominio/estados.ts` (event type and `case "publicado"`)
- Test: `tests/unit/estados.test.ts` (append; if the file has another name, `grep -ln "quedanAMano" tests/unit` finds it)

- [ ] **Step 1: Write the failing test** (append inside the existing `describe` for `publicado`, or a new one)

```ts
describe("publicado when the last automatic destination closes a mixed piece", () => {
  it("handles algunoAMano when nothing remains by hand: the piece is publicado_a_mano", () => {
    const pieza = { ...piezaNueva(), estado: "programado" as const }
    expect(transicionar(pieza, { tipo: "publicado", algunoAMano: true }).pieza.estado).toBe("publicado_a_mano")
  })

  it("keeps para_subir_a_mano when something is still by hand, whatever algunoAMano says", () => {
    const pieza = { ...piezaNueva(), estado: "programado" as const }
    expect(
      transicionar(pieza, { tipo: "publicado", quedanAMano: true, algunoAMano: true }).pieza.estado,
    ).toBe("para_subir_a_mano")
  })

  it("is publicado when every destination was automatic", () => {
    const pieza = { ...piezaNueva(), estado: "programado" as const }
    expect(transicionar(pieza, { tipo: "publicado" }).pieza.estado).toBe("publicado")
  })
})
```

(Import `piezaNueva` and `transicionar` from `@/lib/dominio/estados` if the file does not already.)

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test:run tests/unit/estados.test.ts`
Expected: FAIL (`publicado` instead of `publicado_a_mano`, plus a type error on `algunoAMano`).

- [ ] **Step 3: Implement**

In the `Evento` union replace the `publicado` member with:

```ts
  /**
   * `quedanAMano`: a destination she uploads herself is still pending. `algunoAMano`: nothing is pending, but one
   * destination was uploaded by hand (the last automatic one closes a mixed piece, design 2026-10-07 L7).
   */
  | { tipo: "publicado"; quedanAMano?: boolean; algunoAMano?: boolean }
```

and the case with:

```ts
    case "publicado":
      if (estado !== "programado") throw invalida()
      if (evento.quedanAMano) return a("para_subir_a_mano")
      return a(evento.algunoAMano ? "publicado_a_mano" : "publicado")
```

- [ ] **Step 4: Run it**

Run: `pnpm test:run tests/unit/estados.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dominio/estados.ts tests/unit/estados.test.ts
git commit -m "$(printf 'Permite cerrar una pieza mixta como publicada a mano\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 5: OAuth provider and the fake LinkedIn (L2, F10, F11)

**Files:**
- Create: `lib/acciones/estado-oauth.ts`, `lib/proveedores/linkedin-oauth.ts`, `tests/linkedin-msw.ts`
- Modify: `lib/acciones/instagram.ts` (re-export the state helpers)
- Test: `tests/unit/linkedin-oauth.test.ts`

- [ ] **Step 1: Write the fake LinkedIn** (`tests/linkedin-msw.ts`, test support, no test of its own)

```ts
import { HttpResponse, http } from "msw"
import { servidor } from "./msw"

export const OAUTH = "https://www.linkedin.com"
export const API = "https://api.linkedin.com"
export const SUBIDAS = "https://www.linkedin.com/dms-uploads"
export const PARTE = 4_194_304

export interface OpcionesLinkedin {
  /** Answers of GET /rest/videos/{urn}, in order; the last one repeats. */
  estados?: string[]
  token?: () => Response
  userinfo?: () => Response
  iniciar?: () => Response
  parte?: (indice: number) => Response
  finalizar?: () => Response
  video?: () => Response
  post?: () => Response
}

export interface SimulacionLinkedin {
  tokens: URLSearchParams[]
  iniciadas: unknown[]
  partes: { indice: number; bytes: number }[]
  finalizadas: unknown[]
  consultasDeVideo: string[]
  posts: Record<string, unknown>[]
  cabeceras: Record<string, string | null>[]
}

/** LinkedIn for the tests: records what it was asked and never leaves the machine. */
export function simularLinkedin(opciones: OpcionesLinkedin = {}): SimulacionLinkedin {
  const sim: SimulacionLinkedin = {
    tokens: [],
    iniciadas: [],
    partes: [],
    finalizadas: [],
    consultasDeVideo: [],
    posts: [],
    cabeceras: [],
  }
  const estados = opciones.estados ?? ["AVAILABLE"]
  let consultas = 0
  let bytesDelVideo = 0
  const guardarCabeceras = (request: Request) =>
    sim.cabeceras.push({
      autorizacion: request.headers.get("authorization"),
      version: request.headers.get("linkedin-version"),
      protocolo: request.headers.get("x-restli-protocol-version"),
    })

  servidor.use(
    http.post(`${OAUTH}/oauth/v2/accessToken`, async ({ request }) => {
      sim.tokens.push(new URLSearchParams(await request.text()))
      return (
        opciones.token?.() ??
        HttpResponse.json({ access_token: "AQV_token_de_prueba", expires_in: 5_184_000, scope: "openid,profile,w_member_social" })
      )
    }),
    http.get(`${API}/v2/userinfo`, ({ request }) => {
      guardarCabeceras(request)
      return opciones.userinfo?.() ?? HttpResponse.json({ sub: "abc123XYZ", name: "Coni del Rosario" })
    }),
    http.post(`${API}/rest/videos`, async ({ request }) => {
      guardarCabeceras(request)
      const accion = new URL(request.url).searchParams.get("action")
      const cuerpo = (await request.json()) as Record<string, { fileSizeBytes?: number }>
      if (accion === "initializeUpload") {
        sim.iniciadas.push(cuerpo)
        if (opciones.iniciar) return opciones.iniciar()
        bytesDelVideo = cuerpo.initializeUploadRequest?.fileSizeBytes ?? 0
        const partes = Math.max(1, Math.ceil(bytesDelVideo / PARTE))
        return HttpResponse.json({
          value: {
            video: "urn:li:video:C5505AQprueba",
            uploadToken: "",
            uploadUrlsExpireAt: 4_102_444_800_000,
            uploadInstructions: Array.from({ length: partes }, (_, i) => ({
              uploadUrl: `${SUBIDAS}/C5505AQprueba/parte/${i}`,
              firstByte: i * PARTE,
              lastByte: Math.min(bytesDelVideo, (i + 1) * PARTE) - 1,
            })),
          },
        })
      }
      sim.finalizadas.push(cuerpo)
      return opciones.finalizar?.() ?? new HttpResponse(null, { status: 200 })
    }),
    http.put(`${SUBIDAS}/C5505AQprueba/parte/:indice`, async ({ request, params }) => {
      const indice = Number(params.indice)
      sim.partes.push({ indice, bytes: (await request.arrayBuffer()).byteLength })
      return opciones.parte?.(indice) ?? new HttpResponse(null, { status: 200, headers: { etag: `"etag-${indice}"` } })
    }),
    http.get(`${API}/rest/videos/:urn`, ({ request, params }) => {
      guardarCabeceras(request)
      sim.consultasDeVideo.push(String(params.urn))
      if (opciones.video) return opciones.video()
      const estado = estados[Math.min(consultas, estados.length - 1)]
      consultas += 1
      return HttpResponse.json({
        id: "urn:li:video:C5505AQprueba",
        status: estado,
        ...(estado === "PROCESSING_FAILED" ? { processingFailureReason: "Formato no soportado" } : {}),
      })
    }),
    http.post(`${API}/rest/posts`, async ({ request }) => {
      guardarCabeceras(request)
      sim.posts.push((await request.json()) as Record<string, unknown>)
      return (
        opciones.post?.() ??
        new HttpResponse(null, { status: 201, headers: { "x-restli-id": `urn:li:share:7${sim.posts.length}` } })
      )
    }),
  )
  return sim
}
```

- [ ] **Step 2: Write the failing test** (`tests/unit/linkedin-oauth.test.ts`)

```ts
// @vitest-environment node
import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import { estadoCoincide, nuevoEstado } from "@/lib/acciones/estado-oauth"
import { Falla } from "@/lib/dominio/falla"
import {
  intercambiarCodigoLinkedin,
  leerMiembro,
  SCOPES_DE_LINKEDIN,
  urlDeAutorizacionLinkedin,
} from "@/lib/proveedores/linkedin-oauth"
import { simularLinkedin } from "../linkedin-msw"

const APP = { clientId: "77abc", clientSecret: "secreto-de-prueba", redirectUri: "https://estudio.example/api/linkedin/callback" }

describe("urlDeAutorizacionLinkedin", () => {
  it("asks only for openid, profile and w_member_social, space separated, with the state", () => {
    const url = new URL(urlDeAutorizacionLinkedin({ clientId: APP.clientId, redirectUri: APP.redirectUri, estado: "e1" }))
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization")
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("client_id")).toBe("77abc")
    expect(url.searchParams.get("redirect_uri")).toBe(APP.redirectUri)
    expect(url.searchParams.get("state")).toBe("e1")
    expect(url.searchParams.get("scope")).toBe("openid profile w_member_social")
    expect(url.toString()).toContain("scope=openid%20profile%20w_member_social")
    expect(SCOPES_DE_LINKEDIN).not.toContain("email")
  })
})

describe("intercambiarCodigoLinkedin", () => {
  it("trades the code with a form post and returns token, seconds and granted scopes", async () => {
    const sim = simularLinkedin()
    const resultado = await intercambiarCodigoLinkedin({ ...APP, codigo: "codigo-1" })
    expect(resultado).toEqual({
      token: "AQV_token_de_prueba",
      expiraEnSegundos: 5_184_000,
      scopes: ["openid", "profile", "w_member_social"],
    })
    expect(Object.fromEntries(sim.tokens[0] ?? [])).toEqual({
      grant_type: "authorization_code",
      code: "codigo-1",
      client_id: "77abc",
      client_secret: "secreto-de-prueba",
      redirect_uri: APP.redirectUri,
    })
  })

  it("turns a 4xx into a Falla for Coni, without the secret in the message", async () => {
    simularLinkedin({ token: () => HttpResponse.json({ error: "invalid_request", secreto: "secreto-de-prueba" }, { status: 400 }) })
    const error = await intercambiarCodigoLinkedin({ ...APP, codigo: "x" }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Falla)
    expect(String((error as Error).message)).not.toContain("secreto-de-prueba")
  })

  it("keeps a 5xx as a plain error", async () => {
    simularLinkedin({ token: () => new HttpResponse(null, { status: 503 }) })
    const error = await intercambiarCodigoLinkedin({ ...APP, codigo: "x" }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(Falla)
  })
})

describe("leerMiembro", () => {
  it("builds the person URN from sub and keeps the name, with the bearer token", async () => {
    const sim = simularLinkedin()
    expect(await leerMiembro({ token: "AQV_token_de_prueba" })).toEqual({
      miembro: "urn:li:person:abc123XYZ",
      nombre: "Coni del Rosario",
    })
    expect(sim.cabeceras[0]?.autorizacion).toBe("Bearer AQV_token_de_prueba")
  })

  it("refuses a sub that cannot be part of a URN", async () => {
    simularLinkedin({ userinfo: () => HttpResponse.json({ sub: "a b:c" }) })
    await expect(leerMiembro({ token: "t" })).rejects.toThrow(/inesperada/)
  })
})

describe("estado-oauth", () => {
  it("makes 64 hex characters and compares in constant time", () => {
    const estado = nuevoEstado()
    expect(estado).toMatch(/^[0-9a-f]{64}$/)
    expect(estadoCoincide(estado, estado)).toBe(true)
    expect(estadoCoincide(estado, `${estado.slice(0, 63)}0`)).toBe(estado.endsWith("0"))
    expect(estadoCoincide(undefined, estado)).toBe(false)
  })
})
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `pnpm test:run tests/unit/linkedin-oauth.test.ts`
Expected: FAIL (`Cannot find module '@/lib/acciones/estado-oauth'`).

- [ ] **Step 4: Implement**

`lib/acciones/estado-oauth.ts`: move `nuevoEstado` and `estadoCoincide` here verbatim from `lib/acciones/instagram.ts`,
with their imports (`randomBytes`, `timingSafeEqual` from `node:crypto`). In `lib/acciones/instagram.ts`, delete both
functions and add:

```ts
import { estadoCoincide } from "@/lib/acciones/estado-oauth"
export { estadoCoincide, nuevoEstado } from "@/lib/acciones/estado-oauth"
```

`lib/proveedores/linkedin-oauth.ts`:

```ts
import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import { baseDe } from "./bases"

// OAuth 2.0 authorization code flow (F11):
// https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
// OIDC userinfo (F10): https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
// No refresh token for a self-serve app (F12): renewing is this same flow.
export const SCOPES_DE_LINKEDIN = ["openid", "profile", "w_member_social"] as const

const BASE_OAUTH = "https://www.linkedin.com"
const BASE_API = "https://api.linkedin.com"
const ESPERA_MS = 30_000

/** Written for Coni: she is the one who can connect again. */
export const REFUSADA_LINKEDIN = "LinkedIn no aceptó la conexión. Vuelve a conectarla desde Ajustes."

interface App {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function urlDeAutorizacionLinkedin(entrada: Omit<App, "clientSecret"> & { estado: string }): string {
  const consulta = new URLSearchParams({
    response_type: "code",
    client_id: entrada.clientId,
    redirect_uri: entrada.redirectUri,
    state: entrada.estado,
    scope: SCOPES_DE_LINKEDIN.join(" "),
  })
  // URLSearchParams writes a space as "+"; LinkedIn documents URL-encoded, space-delimited scopes.
  return `${baseDe(process.env, "LINKEDIN_OAUTH_BASE_URL", BASE_OAUTH)}/oauth/v2/authorization?${consulta.toString().replace(/\+/g, "%20")}`
}

function sinSecretos(texto: string, secretos: readonly string[]): string {
  return secretos.reduce((limpio, secreto) => (secreto ? limpio.split(secreto).join("[x]") : limpio), texto)
}

async function pedir(url: string, init: RequestInit, secretos: readonly string[]): Promise<unknown> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(ESPERA_MS) })
  } catch (error) {
    throw new Error("No pude conectar con LinkedIn.", { cause: error })
  }
  if (!respuesta.ok) {
    const detalle = sinSecretos((await respuesta.text()).slice(0, 300), secretos)
    console.error(`LinkedIn respondió HTTP ${respuesta.status} al conectar la cuenta: ${detalle}`)
    const deCliente = respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 408 && respuesta.status !== 429
    if (deCliente) throw new Falla(REFUSADA_LINKEDIN)
    throw new Error(`LinkedIn respondió HTTP ${respuesta.status} al conectar la cuenta.`)
  }
  try {
    return await respuesta.json()
  } catch (error) {
    throw new Error("LinkedIn devolvió una respuesta ilegible.", { cause: error })
  }
}

const RespuestaDeToken = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  scope: z.string().optional(),
})

export async function intercambiarCodigoLinkedin(
  entrada: App & { codigo: string },
): Promise<{ token: string; expiraEnSegundos: number; scopes: string[] | null }> {
  const cuerpo = await pedir(
    `${baseDe(process.env, "LINKEDIN_OAUTH_BASE_URL", BASE_OAUTH)}/oauth/v2/accessToken`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: entrada.codigo,
        client_id: entrada.clientId,
        client_secret: entrada.clientSecret,
        redirect_uri: entrada.redirectUri,
      }).toString(),
    },
    [entrada.clientSecret, entrada.codigo],
  )
  const leida = RespuestaDeToken.safeParse(cuerpo)
  if (!leida.success) throw new Error("LinkedIn devolvió una respuesta inesperada en /oauth/v2/accessToken.")
  return {
    token: leida.data.access_token,
    expiraEnSegundos: leida.data.expires_in,
    // The separator is not documented: commas and blanks are both read.
    scopes: leida.data.scope ? leida.data.scope.split(/[\s,]+/).filter(Boolean) : null,
  }
}

const RespuestaDeUsuario = z.object({ sub: z.string().regex(/^[A-Za-z0-9_-]+$/), name: z.string().optional() })

/** F10: the author is `urn:li:person:{sub}` (checked by the first real post in the smoke). */
export async function leerMiembro(entrada: { token: string }): Promise<{ miembro: string; nombre: string | null }> {
  const cuerpo = await pedir(
    `${baseDe(process.env, "LINKEDIN_API_BASE_URL", BASE_API)}/v2/userinfo`,
    { method: "GET", headers: { Authorization: `Bearer ${entrada.token}` } },
    [entrada.token],
  )
  const leido = RespuestaDeUsuario.safeParse(cuerpo)
  if (!leido.success) throw new Error("LinkedIn devolvió una respuesta inesperada en /v2/userinfo.")
  return { miembro: `urn:li:person:${leido.data.sub}`, nombre: leido.data.name?.trim() || null }
}
```

The test calls `intercambiarCodigoLinkedin` with a `scope` in the response, so `scopes` is an array. When LinkedIn
omits `scope`, the value is `null`, and Task 7 treats `null` as "not checked".

- [ ] **Step 5: Run it**

Run: `pnpm test:run tests/unit/linkedin-oauth.test.ts tests/unit/conexion-instagram.test.ts tests/unit/instagram-oauth.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/acciones/estado-oauth.ts lib/acciones/instagram.ts lib/proveedores/linkedin-oauth.ts tests/linkedin-msw.ts tests/unit/linkedin-oauth.test.ts
git commit -m "$(printf 'Agrega el OAuth de LinkedIn y su simulación para tests\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 6: Videos and Posts API provider (F2 to F8, F17)

**Files:**
- Create: `lib/proveedores/linkedin.ts`
- Test: `tests/unit/linkedin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment node
import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"
import {
  crearPost,
  estadoDelVideo,
  RechazoDeLinkedin,
  RespuestaDudosa,
  subirVideo,
  TokenDeLinkedinVencido,
  VERSION_DE_LINKEDIN,
} from "@/lib/proveedores/linkedin"
import { PARTE, simularLinkedin } from "../linkedin-msw"

const TOKEN = "AQV_token_de_prueba"
const MIEMBRO = "urn:li:person:abc123XYZ"

describe("subirVideo", () => {
  it("initializes for the member, uploads each byte range and finalizes with the ETags in order", async () => {
    const sim = simularLinkedin()
    const datos = new Uint8Array(PARTE * 2 + 10)

    const video = await subirVideo({ token: TOKEN, miembro: MIEMBRO, datos })

    expect(video).toBe("urn:li:video:C5505AQprueba")
    expect(sim.iniciadas[0]).toEqual({
      initializeUploadRequest: { owner: MIEMBRO, fileSizeBytes: PARTE * 2 + 10, uploadCaptions: false, uploadThumbnail: false },
    })
    expect(sim.partes).toEqual([
      { indice: 0, bytes: PARTE },
      { indice: 1, bytes: PARTE },
      { indice: 2, bytes: 10 },
    ])
    expect(sim.finalizadas[0]).toEqual({
      finalizeUploadRequest: { video: "urn:li:video:C5505AQprueba", uploadToken: "", uploadedPartIds: ["etag-0", "etag-1", "etag-2"] },
    })
    expect(sim.cabeceras.every((c) => c.version === VERSION_DE_LINKEDIN && c.protocolo === "2.0.0")).toBe(true)
  })

  it("fails without an ETag on a part", async () => {
    simularLinkedin({ parte: () => new HttpResponse(null, { status: 200 }) })
    await expect(subirVideo({ token: TOKEN, miembro: MIEMBRO, datos: new Uint8Array(100_000) })).rejects.toThrow(/ETag/)
  })
})

describe("estadoDelVideo", () => {
  it.each([
    ["AVAILABLE", "listo"],
    ["PROCESSING", "procesando"],
    ["WAITING_UPLOAD", "procesando"],
    ["PROCESSING_FAILED", "fallido"],
  ])("handles %s when LinkedIn answers it: %s", async (status, esperado) => {
    simularLinkedin({ estados: [status] })
    expect((await estadoDelVideo({ token: TOKEN, video: "urn:li:video:C5505AQprueba" })).estado).toBe(esperado)
  })

  it("encodes the URN in the path", async () => {
    const sim = simularLinkedin()
    await estadoDelVideo({ token: TOKEN, video: "urn:li:video:C5505AQprueba" })
    expect(sim.consultasDeVideo[0]).toBe("urn:li:video:C5505AQprueba")
  })
})

describe("crearPost", () => {
  it("posts the little text publicly with the video and returns the URN from x-restli-id", async () => {
    const sim = simularLinkedin()
    const urn = await crearPost({ token: TOKEN, miembro: MIEMBRO, video: "urn:li:video:C1", commentary: "Hola \\(1\\)" })
    expect(urn).toBe("urn:li:share:71")
    expect(sim.posts[0]).toEqual({
      author: MIEMBRO,
      commentary: "Hola \\(1\\)",
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { id: "urn:li:video:C1" } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    })
  })

  it("treats a 201 without a valid id as in doubt", async () => {
    simularLinkedin({ post: () => new HttpResponse(null, { status: 201 }) })
    await expect(crearPost({ token: TOKEN, miembro: MIEMBRO, video: "v", commentary: "x" })).rejects.toBeInstanceOf(
      RespuestaDudosa,
    )
  })
})

describe("errors", () => {
  it("turns 401 into TokenDeLinkedinVencido", async () => {
    simularLinkedin({ iniciar: () => HttpResponse.json({ status: 401, message: "Expired" }, { status: 401 }) })
    await expect(subirVideo({ token: TOKEN, miembro: MIEMBRO, datos: new Uint8Array(100_000) })).rejects.toBeInstanceOf(
      TokenDeLinkedinVencido,
    )
  })

  it.each([403, 422, 426])("turns %s into a RechazoDeLinkedin with its status", async (status) => {
    simularLinkedin({ iniciar: () => HttpResponse.json({ status, message: "no" }, { status }) })
    const error = await subirVideo({ token: TOKEN, miembro: MIEMBRO, datos: new Uint8Array(100_000) }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RechazoDeLinkedin)
    expect((error as RechazoDeLinkedin).http).toBe(status)
  })

  it.each([429, 500, 503])("keeps %s as a temporary plain error", async (status) => {
    simularLinkedin({ iniciar: () => new HttpResponse(null, { status }) })
    const error = await subirVideo({ token: TOKEN, miembro: MIEMBRO, datos: new Uint8Array(100_000) }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(RechazoDeLinkedin)
    expect(error).not.toBeInstanceOf(TokenDeLinkedinVencido)
  })

  it("never puts the token in an error message", async () => {
    simularLinkedin({ iniciar: () => HttpResponse.json({ echo: TOKEN }, { status: 400 }) })
    const error = (await subirVideo({ token: TOKEN, miembro: MIEMBRO, datos: new Uint8Array(100_000) }).catch((e: unknown) => e)) as Error
    expect(error.message).not.toContain(TOKEN)
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test:run tests/unit/linkedin.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`lib/proveedores/linkedin.ts`)

```ts
import { z } from "zod"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"
import { esUrnDePost } from "@/lib/dominio/linkedin"
import { baseDe } from "./bases"

// Versioned REST APIs for a member (F2, F3, F4):
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api
// https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
// https://learn.microsoft.com/en-us/linkedin/marketing/versioning (each version lives at least one year; there is no
// default, so every call carries one). Bump it with a reviewed commit when the nightly alert says so.
export const VERSION_DE_LINKEDIN = "202609"

const BASE_API = "https://api.linkedin.com"
const ESPERA_MS = 30_000
const ESPERA_PARTE_MS = 120_000

/** 401 (F17): expired or revoked. Coni renews LinkedIn in Ajustes. */
export class TokenDeLinkedinVencido extends FallaDeConfiguracion {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "TokenDeLinkedinVencido"
  }
}

/** A definitive "no" (4xx other than 401, 408, 429), including 426 for a sunset version. */
export class RechazoDeLinkedin extends FallaDeConfiguracion {
  constructor(
    readonly http: number,
    mensaje: string,
  ) {
    super(mensaje)
    this.name = "RechazoDeLinkedin"
  }
}

/** The post may or may not exist: never send it again (L6.8). */
export class RespuestaDudosa extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "RespuestaDudosa"
  }
}

function base(): string {
  return baseDe(process.env, "LINKEDIN_API_BASE_URL", BASE_API)
}

function cabeceras(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Linkedin-Version": VERSION_DE_LINKEDIN,
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  }
}

async function errorDe(respuesta: Response, ruta: string, token: string): Promise<Error> {
  const detalle = (await respuesta.text()).slice(0, 300).split(token).join("[x]")
  const mensaje = `LinkedIn respondió HTTP ${respuesta.status} en ${ruta}: ${detalle}`
  if (respuesta.status === 401) return new TokenDeLinkedinVencido(mensaje)
  if (respuesta.status >= 400 && respuesta.status < 500 && respuesta.status !== 408 && respuesta.status !== 429) {
    return new RechazoDeLinkedin(respuesta.status, mensaje)
  }
  return new Error(mensaje)
}

async function llamar(url: string, init: RequestInit, ruta: string, token: string, espera = ESPERA_MS): Promise<Response> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { ...init, signal: AbortSignal.timeout(espera) })
  } catch (error) {
    // Deliberately without the URL: an upload URL is a credential.
    throw new Error(`No pude conectar con LinkedIn en ${ruta}.`, { cause: error })
  }
  if (!respuesta.ok) throw await errorDe(respuesta, ruta, token)
  return respuesta
}

const Iniciada = z.object({
  value: z.object({
    video: z.string().startsWith("urn:li:video:"),
    uploadToken: z.string(),
    uploadInstructions: z
      .array(z.object({ uploadUrl: z.string().url(), firstByte: z.number().int(), lastByte: z.number().int() }))
      .min(1),
  }),
})

/** initializeUpload, one PUT per byte range (ETags kept in order), finalizeUpload (F5). Returns the video URN. */
export async function subirVideo(entrada: { token: string; miembro: string; datos: Uint8Array }): Promise<string> {
  const { token, miembro, datos } = entrada
  const inicio = await llamar(
    `${base()}/rest/videos?action=initializeUpload`,
    {
      method: "POST",
      headers: cabeceras(token),
      body: JSON.stringify({
        initializeUploadRequest: { owner: miembro, fileSizeBytes: datos.byteLength, uploadCaptions: false, uploadThumbnail: false },
      }),
    },
    "initializeUpload",
    token,
  )
  const leida = Iniciada.safeParse(await inicio.json())
  if (!leida.success) throw new Error("LinkedIn devolvió una respuesta inesperada en initializeUpload.")
  const { video, uploadToken, uploadInstructions } = leida.data.value

  const etags: string[] = []
  for (const parte of uploadInstructions) {
    const respuesta = await llamar(
      parte.uploadUrl,
      {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: datos.slice(parte.firstByte, parte.lastByte + 1),
      },
      "la subida de una parte",
      token,
      ESPERA_PARTE_MS,
    )
    const etag = respuesta.headers.get("etag")
    if (!etag) throw new Error("LinkedIn no devolvió el ETag de una parte del video.")
    etags.push(etag.replace(/^"|"$/g, ""))
  }

  await llamar(
    `${base()}/rest/videos?action=finalizeUpload`,
    {
      method: "POST",
      headers: cabeceras(token),
      body: JSON.stringify({ finalizeUploadRequest: { video, uploadToken, uploadedPartIds: etags } }),
    },
    "finalizeUpload",
    token,
  )
  return video
}

const Video = z.object({ status: z.string(), processingFailureReason: z.string().optional() })

export type EstadoDeVideo = { estado: "listo" } | { estado: "procesando" } | { estado: "fallido"; detalle: string }

/** F6: post only when AVAILABLE. */
export async function estadoDelVideo(entrada: { token: string; video: string }): Promise<EstadoDeVideo> {
  const respuesta = await llamar(
    `${base()}/rest/videos/${encodeURIComponent(entrada.video)}`,
    { method: "GET", headers: cabeceras(entrada.token) },
    "el estado del video",
    entrada.token,
  )
  const leido = Video.safeParse(await respuesta.json())
  if (!leido.success) throw new Error("LinkedIn devolvió una respuesta inesperada al leer el video.")
  switch (leido.data.status) {
    case "AVAILABLE":
      return { estado: "listo" }
    case "PROCESSING_FAILED":
      return { estado: "fallido", detalle: leido.data.processingFailureReason ?? "sin motivo" }
    default:
      return { estado: "procesando" }
  }
}

/** F7: the 201 carries the post URN in `x-restli-id`. No title: it is not part of gate 2. */
export async function crearPost(entrada: {
  token: string
  miembro: string
  video: string
  commentary: string
}): Promise<string> {
  const respuesta = await llamar(
    `${base()}/rest/posts`,
    {
      method: "POST",
      headers: cabeceras(entrada.token),
      body: JSON.stringify({
        author: entrada.miembro,
        commentary: entrada.commentary,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { media: { id: entrada.video } },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
    },
    "posts",
    entrada.token,
  )
  const urn = respuesta.headers.get("x-restli-id")?.trim() ?? ""
  if (!esUrnDePost(urn)) throw new RespuestaDudosa(`LinkedIn respondió ${respuesta.status} sin un id de post válido.`)
  return urn
}
```

- [ ] **Step 4: Run it**

Run: `pnpm test:run tests/unit/linkedin.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/proveedores/linkedin.ts tests/unit/linkedin.test.ts
git commit -m "$(printf 'Agrega el proveedor de videos y posts de LinkedIn\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 7: Connect and disconnect actions (L2, L3)

**Files:**
- Create: `lib/acciones/linkedin.ts`
- Modify: `app/(app)/ajustes/acciones.ts` (`desconectarLinkedinAccion`)
- Test: `tests/integration/conexion-linkedin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { HttpResponse } from "msw"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { desconectarLinkedin, leerAppDeLinkedin, terminarConexionLinkedin } from "@/lib/acciones/linkedin"
import { simularLinkedin } from "../linkedin-msw"
import { pool } from "./db"
import { clienteDeConi } from "./sesion-coni"

const APP = { clientId: "77abc", clientSecret: "secreto-de-prueba", redirectUri: "https://estudio.example/api/linkedin/callback" }
const AHORA = "2031-01-01T12:00:00.000Z"
const ESTADO = "e".repeat(64)

let coni: Awaited<ReturnType<typeof clienteDeConi>>
beforeAll(async () => {
  coni = await clienteDeConi()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})
afterAll(() => pool.end())

const deps = () => ({ db: coni, app: APP, ahora: () => AHORA })
const llegada = { codigo: "codigo-1", estado: ESTADO, estadoGuardado: ESTADO, errorDeLinkedin: null }

describe("leerAppDeLinkedin", () => {
  it("is null until the three variables are set", () => {
    expect(leerAppDeLinkedin({ LINKEDIN_CLIENT_ID: "a", LINKEDIN_CLIENT_SECRET: "b" })).toBeNull()
    expect(
      leerAppDeLinkedin({ LINKEDIN_CLIENT_ID: "a", LINKEDIN_CLIENT_SECRET: "b", LINKEDIN_REDIRECT_URI: "c" }),
    ).toEqual({ clientId: "a", clientSecret: "b", redirectUri: "c" })
  })
})

describe("terminarConexionLinkedin", () => {
  it("saves token, member, name and 60-day expiry when everything checks", async () => {
    simularLinkedin()
    expect(await terminarConexionLinkedin(deps(), llegada)).toEqual({ ok: true, nombre: "Coni del Rosario" })
    const { rows } = await pool.query("select linkedin_miembro, linkedin_token_expira_en from public.ajustes")
    expect(rows[0].linkedin_miembro).toBe("urn:li:person:abc123XYZ")
    expect(new Date(rows[0].linkedin_token_expira_en).toISOString()).toBe("2031-03-02T12:00:00.000Z")
  })

  it.each([
    [{ ...llegada, estadoGuardado: "f".repeat(64) }, "estado"],
    [{ ...llegada, errorDeLinkedin: "user_cancelled_authorize" }, "cancelada"],
    [{ ...llegada, codigo: undefined }, "fallo"],
  ])("handles a bad arrival without calling LinkedIn: %o -> %s", async (mala, motivo) => {
    const sim = simularLinkedin()
    expect(await terminarConexionLinkedin(deps(), mala)).toEqual({ ok: false, motivo })
    expect(sim.tokens).toHaveLength(0)
  })

  it("says sin_app without the variables", async () => {
    expect(await terminarConexionLinkedin({ ...deps(), app: null }, llegada)).toEqual({ ok: false, motivo: "sin_app" })
  })

  it("refuses a connection without w_member_social and saves nothing", async () => {
    simularLinkedin({ token: () => HttpResponse.json({ access_token: "t", expires_in: 5_184_000, scope: "openid,profile" }) })
    expect(await terminarConexionLinkedin(deps(), llegada)).toEqual({ ok: false, motivo: "permisos" })
    expect((await pool.query("select count(*)::int as n from vault.secrets where name = 'linkedin'")).rows[0].n).toBe(0)
  })

  it("says rechazada when LinkedIn refuses the code, fallo on a 5xx", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    simularLinkedin({ token: () => HttpResponse.json({ error: "invalid_grant" }, { status: 400 }) })
    expect(await terminarConexionLinkedin(deps(), llegada)).toEqual({ ok: false, motivo: "rechazada" })
    simularLinkedin({ userinfo: () => new HttpResponse(null, { status: 502 }) })
    expect(await terminarConexionLinkedin(deps(), llegada)).toEqual({ ok: false, motivo: "fallo" })
  })
})

describe("desconectarLinkedin", () => {
  it("forgets the token and the member", async () => {
    simularLinkedin()
    await terminarConexionLinkedin(deps(), llegada)
    await desconectarLinkedin(coni)
    const { rows } = await pool.query("select linkedin_miembro from public.ajustes")
    expect(rows[0].linkedin_miembro).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test:db tests/integration/conexion-linkedin.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** (`lib/acciones/linkedin.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { estadoCoincide } from "@/lib/acciones/estado-oauth"
import { Falla } from "@/lib/dominio/falla"
import { intercambiarCodigoLinkedin, leerMiembro } from "@/lib/proveedores/linkedin-oauth"
import type { Database } from "@/lib/supabase/database.types"

type Entorno = Record<string, string | undefined>

export interface AppDeLinkedin {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/** The LinkedIn app Federico creates (spec checklist); null until the three variables are set. */
export function leerAppDeLinkedin(entorno: Entorno): AppDeLinkedin | null {
  const { LINKEDIN_CLIENT_ID: clientId, LINKEDIN_CLIENT_SECRET: clientSecret, LINKEDIN_REDIRECT_URI: redirectUri } =
    entorno
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null
}

export type MotivoDeFalloLinkedin = "estado" | "cancelada" | "rechazada" | "permisos" | "sin_app" | "fallo"
export type ResultadoDeConexionLinkedin = { ok: true; nombre: string | null } | { ok: false; motivo: MotivoDeFalloLinkedin }

export interface DepsDeConexionLinkedin {
  /** Coni's session: `conectar_linkedin` only answers to her. */
  db: SupabaseClient<Database>
  app: AppDeLinkedin | null
  ahora: () => string
}

/** The callback of "Conectar LinkedIn" (L2). Whatever fails leaves Vault and `ajustes` as they were. */
export async function terminarConexionLinkedin(
  deps: DepsDeConexionLinkedin,
  llegada: { codigo?: string; estado?: string | null; estadoGuardado?: string | null; errorDeLinkedin?: string | null },
): Promise<ResultadoDeConexionLinkedin> {
  if (!deps.app) return { ok: false, motivo: "sin_app" }
  if (!estadoCoincide(llegada.estadoGuardado, llegada.estado)) return { ok: false, motivo: "estado" }
  if (llegada.errorDeLinkedin) return { ok: false, motivo: "cancelada" }
  if (!llegada.codigo) return { ok: false, motivo: "fallo" }

  try {
    const acceso = await intercambiarCodigoLinkedin({ ...deps.app, codigo: llegada.codigo })
    if (acceso.scopes !== null && !acceso.scopes.includes("w_member_social")) return { ok: false, motivo: "permisos" }
    const { miembro, nombre } = await leerMiembro({ token: acceso.token })
    const expiraEn = new Date(Date.parse(deps.ahora()) + acceso.expiraEnSegundos * 1000).toISOString()
    const { error } = await deps.db.rpc("conectar_linkedin", {
      p_token: acceso.token,
      p_miembro: miembro,
      p_nombre: nombre ?? "",
      p_expira_en: expiraEn,
    })
    if (error) throw new Error(`No pude guardar la conexión de LinkedIn: ${error.message}`, { cause: error })
    return { ok: true, nombre }
  } catch (error) {
    if (error instanceof Falla) return { ok: false, motivo: "rechazada" }
    console.error("No pude conectar LinkedIn", error)
    return { ok: false, motivo: "fallo" }
  }
}

/** "Desconectar" (L4): there is no revoke endpoint (F13), so only our copy goes. */
export async function desconectarLinkedin(db: SupabaseClient<Database>): Promise<Record<string, never>> {
  const { error } = await db.rpc("desconectar_linkedin")
  if (error) throw new Error(`No pude desconectar LinkedIn: ${error.message}`, { cause: error })
  return {}
}
```

In `app/(app)/ajustes/acciones.ts` add:

```ts
import { desconectarLinkedin } from "@/lib/acciones/linkedin"

export async function desconectarLinkedinAccion() {
  return refrescar(await conSesionDeConi("desconectarLinkedin", z.object({}), {}, (db) => desconectarLinkedin(db)))
}
```

- [ ] **Step 4: Run it**

Run: `pnpm test:db tests/integration/conexion-linkedin.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/linkedin.ts "app/(app)/ajustes/acciones.ts" tests/integration/conexion-linkedin.test.ts
git commit -m "$(printf 'Agrega conectar y desconectar LinkedIn\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 8: OAuth routes, cookie and callback notice (L2, L4 table)

**Files:**
- Create: `lib/acciones/linkedin-cookie.ts`, `app/api/linkedin/conectar/route.ts`, `app/api/linkedin/callback/route.ts`, `lib/ajustes/linkedin-aviso.ts`
- Modify: `app/(app)/ajustes/cuentas/page.tsx` (read `?linkedin=`)
- Test: `tests/unit/aviso-de-linkedin.test.ts`, `tests/unit/rutas-linkedin.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/aviso-de-linkedin.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { avisoDeLinkedin } from "@/lib/ajustes/linkedin-aviso"

describe("avisoDeLinkedin", () => {
  it.each([
    ["conectada", "ok", "LinkedIn quedó conectado."],
    ["cancelada", "aviso", "Cancelaste la conexión con LinkedIn."],
    ["rechazada", "error", "LinkedIn no aceptó la conexión."],
    ["permisos", "error", "LinkedIn no dio permiso para publicar."],
    ["estado", "error", "La conexión con LinkedIn venció antes de terminar."],
    ["sin_app", "error", "Todavía no está lista la conexión con LinkedIn."],
    ["fallo", "error", "No pude terminar la conexión con LinkedIn."],
  ])("handles %s when the callback says it", (valor, tipo, titulo) => {
    expect(avisoDeLinkedin(valor)).toMatchObject({ tipo, titulo })
  })

  it("reads nothing else from the address", () => {
    expect(avisoDeLinkedin("<script>")).toBeNull()
    expect(avisoDeLinkedin("toString")).toBeNull()
    expect(avisoDeLinkedin(undefined)).toBeNull()
  })

  it("has no em dashes", () => {
    for (const valor of ["conectada", "cancelada", "rechazada", "permisos", "estado", "sin_app", "fallo"]) {
      expect(JSON.stringify(avisoDeLinkedin(valor))).not.toContain("—")
    }
  })
})
```

`tests/unit/rutas-linkedin.test.ts`:

```ts
// @vitest-environment node
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/sesion/coni", () => ({ leerSesion: vi.fn(async () => ({ estado: "coni", db: {} })) }))
const terminar = vi.fn()
vi.mock("@/lib/acciones/linkedin", async (original) => ({
  ...(await original<typeof import("@/lib/acciones/linkedin")>()),
  terminarConexionLinkedin: (...args: unknown[]) => terminar(...args),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  terminar.mockReset()
})

describe("/api/linkedin/conectar", () => {
  it("sends Coni to LinkedIn with a state cookie only the callback path can read", async () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "77abc")
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "s")
    vi.stubEnv("LINKEDIN_REDIRECT_URI", "https://estudio.example/api/linkedin/callback")
    const { GET } = await import("@/app/api/linkedin/conectar/route")
    const respuesta = await GET(new NextRequest("https://estudio.example/api/linkedin/conectar"))
    const destino = new URL(respuesta.headers.get("location") ?? "")
    expect(destino.host).toBe("www.linkedin.com")
    const cookie = respuesta.cookies.get("estudio_linkedin_estado")
    expect(cookie?.value).toBe(destino.searchParams.get("state"))
    expect(cookie).toMatchObject({ httpOnly: true, path: "/api/linkedin", sameSite: "lax", secure: true })
  })

  it("goes back to Cuentas with sin_app when the app is not configured", async () => {
    const { GET } = await import("@/app/api/linkedin/conectar/route")
    const respuesta = await GET(new NextRequest("https://estudio.example/api/linkedin/conectar"))
    expect(respuesta.headers.get("location")).toContain("/ajustes/cuentas?linkedin=sin_app")
  })
})

describe("/api/linkedin/callback", () => {
  it("passes code, state, cookie and error to the action, clears the cookie and returns a fixed word", async () => {
    terminar.mockResolvedValue({ ok: true, nombre: "Coni" })
    const { GET } = await import("@/app/api/linkedin/callback/route")
    const pedido = new NextRequest("https://estudio.example/api/linkedin/callback?code=c1&state=s1")
    pedido.cookies.set("estudio_linkedin_estado", "s1")
    const respuesta = await GET(pedido)
    expect(terminar.mock.calls[0]?.[1]).toEqual({ codigo: "c1", estado: "s1", estadoGuardado: "s1", errorDeLinkedin: null })
    expect(respuesta.headers.get("location")).toContain("/ajustes/cuentas?linkedin=conectada")
    expect(respuesta.cookies.get("estudio_linkedin_estado")?.value).toBe("")
  })
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test:run tests/unit/aviso-de-linkedin.test.ts tests/unit/rutas-linkedin.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`lib/acciones/linkedin-cookie.ts`:

```ts
export const COOKIE_DE_ESTADO_LINKEDIN = "estudio_linkedin_estado"
export const RUTA_DE_LA_COOKIE_LINKEDIN = "/api/linkedin"
const DIEZ_MINUTOS = 10 * 60

export function opcionesDeLaCookieLinkedin(https: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure: https, path: RUTA_DE_LA_COOKIE_LINKEDIN, maxAge: DIEZ_MINUTOS }
}
```

`app/api/linkedin/conectar/route.ts`:

```ts
import { type NextRequest, NextResponse } from "next/server"
import { nuevoEstado } from "@/lib/acciones/estado-oauth"
import { leerAppDeLinkedin } from "@/lib/acciones/linkedin"
import { COOKIE_DE_ESTADO_LINKEDIN, opcionesDeLaCookieLinkedin } from "@/lib/acciones/linkedin-cookie"
import { RUTA_DE_CUENTAS } from "@/lib/ajustes/estado"
import { urlDeAutorizacionLinkedin } from "@/lib/proveedores/linkedin-oauth"
import { leerSesion } from "@/lib/sesion/coni"
import { irA } from "@/lib/sesion/redireccion"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"

// "Conectar LinkedIn" and "Renovar LinkedIn": sends Coni to LinkedIn with a state that only this browser knows.
export async function GET(request: NextRequest) {
  const sesion = await leerSesion()
  if (sesion.estado !== "coni") return irA(RUTA_DE_INGRESO)

  const app = leerAppDeLinkedin(process.env)
  if (!app) return irA(`${RUTA_DE_CUENTAS}?linkedin=sin_app`)

  const estado = nuevoEstado()
  const respuesta = NextResponse.redirect(urlDeAutorizacionLinkedin({ clientId: app.clientId, redirectUri: app.redirectUri, estado }))
  respuesta.cookies.set(COOKIE_DE_ESTADO_LINKEDIN, estado, opcionesDeLaCookieLinkedin(request.nextUrl.protocol === "https:"))
  return respuesta
}
```

`app/api/linkedin/callback/route.ts`:

```ts
import type { NextRequest } from "next/server"
import { leerAppDeLinkedin, terminarConexionLinkedin } from "@/lib/acciones/linkedin"
import { COOKIE_DE_ESTADO_LINKEDIN, RUTA_DE_LA_COOKIE_LINKEDIN } from "@/lib/acciones/linkedin-cookie"
import { RUTA_DE_CUENTAS } from "@/lib/ajustes/estado"
import { leerSesion } from "@/lib/sesion/coni"
import { irA } from "@/lib/sesion/redireccion"
import { RUTA_DE_INGRESO } from "@/lib/sesion/rutas"

// Where LinkedIn sends Coni back. Only the outcome travels to Cuentas conectadas, as a fixed word.
export async function GET(request: NextRequest) {
  const sesion = await leerSesion()
  if (sesion.estado !== "coni") return irA(RUTA_DE_INGRESO)

  const parametros = request.nextUrl.searchParams
  const resultado = await terminarConexionLinkedin(
    { db: sesion.db, app: leerAppDeLinkedin(process.env), ahora: () => new Date().toISOString() },
    {
      codigo: parametros.get("code") ?? undefined,
      estado: parametros.get("state"),
      estadoGuardado: request.cookies.get(COOKIE_DE_ESTADO_LINKEDIN)?.value,
      errorDeLinkedin: parametros.get("error"),
    },
  )

  const respuesta = irA(`${RUTA_DE_CUENTAS}?linkedin=${resultado.ok ? "conectada" : resultado.motivo}`)
  respuesta.cookies.set(COOKIE_DE_ESTADO_LINKEDIN, "", { path: RUTA_DE_LA_COOKIE_LINKEDIN, maxAge: 0 })
  return respuesta
}
```

`lib/ajustes/linkedin-aviso.ts`:

```ts
import type { AvisoDeInstagram } from "./instagram-aviso"

const AVISOS: Record<string, AvisoDeInstagram> = {
  conectada: { tipo: "ok", titulo: "LinkedIn quedó conectado." },
  cancelada: { tipo: "aviso", titulo: "Cancelaste la conexión con LinkedIn.", texto: "Cuando quieras, vuelve a intentarlo desde Cuentas conectadas." },
  rechazada: { tipo: "error", titulo: "LinkedIn no aceptó la conexión.", texto: "Vuelve a conectarla desde Cuentas conectadas." },
  permisos: { tipo: "error", titulo: "LinkedIn no dio permiso para publicar.", texto: "Vuelve a conectarlo y acepta todos los permisos." },
  estado: { tipo: "error", titulo: "La conexión con LinkedIn venció antes de terminar.", texto: "Empieza de nuevo desde Cuentas conectadas." },
  sin_app: { tipo: "error", titulo: "Todavía no está lista la conexión con LinkedIn.", texto: "Falta configurar la app: avísale a Federico." },
  fallo: { tipo: "error", titulo: "No pude terminar la conexión con LinkedIn.", texto: "Inténtalo de nuevo en unos minutos. Si sigue igual, avísale a Federico." },
}

/** The outcome that `/api/linkedin/callback` leaves in the address. Only the fixed words above are read. */
export function avisoDeLinkedin(valor: string | undefined): AvisoDeInstagram | null {
  return valor !== undefined && Object.hasOwn(AVISOS, valor) ? (AVISOS[valor] ?? null) : null
}
```

In `app/(app)/ajustes/cuentas/page.tsx`: the `searchParams` type becomes
`Promise<{ instagram?: string; linkedin?: string }>`, and the notice line becomes:

```tsx
  const { instagram, linkedin } = await searchParams
  const aviso = avisoDeInstagram(instagram) ?? avisoDeLinkedin(linkedin)
```

- [ ] **Step 4: Run them**

Run: `pnpm test:run tests/unit/aviso-de-linkedin.test.ts tests/unit/rutas-linkedin.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/acciones/linkedin-cookie.ts app/api/linkedin lib/ajustes/linkedin-aviso.ts "app/(app)/ajustes/cuentas/page.tsx" tests/unit/aviso-de-linkedin.test.ts tests/unit/rutas-linkedin.test.ts
git commit -m "$(printf 'Agrega las rutas de conexión de LinkedIn\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 9: LinkedIn in the status block and the rows (L4)

**Files:**
- Modify: `lib/ajustes/estado.ts`, `lib/ajustes/revisar.ts`, `lib/ajustes/presentar.ts`, `app/(app)/ajustes/revision.ts`
- Test: `tests/unit/estado-de-ajustes.test.ts` (append), `tests/unit/presentar-cuentas.test.ts` (new), `tests/integration/revisar-cuentas.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/estado-de-ajustes.test.ts`:

```ts
describe("estadoDeAjustes with LinkedIn", () => {
  it("handles a missing LinkedIn when everything else is ready: still todo_bien, not a step", () => {
    const estado = estadoDeAjustes({
      cuentas: [...TODAS_LISTAS, { cuenta: "linkedin", estado: "falta" }],
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })
    expect(estado.tipo).toBe("todo_bien")
    expect(estado.pasos.map((p) => p.etiqueta)).not.toContain("LinkedIn conectado")
  })

  it("asks to renew LinkedIn when it expires within 14 days", () => {
    const estado = estadoDeAjustes({
      cuentas: [...TODAS_LISTAS, { cuenta: "linkedin", estado: "vence", expiraEn: AHORA + 10 * DIA }],
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })
    expect(estado).toMatchObject({
      tipo: "atencion",
      titulo: "LinkedIn vence en 10 días",
      texto: "Renuévalo para que tus videos sigan saliendo solos en LinkedIn. Mientras tanto, te los dejo listos para subir a mano.",
      accion: { etiqueta: "Renovar LinkedIn", href: "/api/linkedin/conectar" },
    })
  })

  it("says LinkedIn stopped being connected when it expired", () => {
    const estado = estadoDeAjustes({
      cuentas: [...TODAS_LISTAS, { cuenta: "linkedin", estado: "vencida" }],
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })
    expect(estado).toMatchObject({ tipo: "atencion", titulo: "LinkedIn dejó de estar conectado" })
  })

  it("puts Instagram first when both need attention", () => {
    const estado = estadoDeAjustes({
      cuentas: [
        ...con({ cuenta: "instagram", estado: "vencida" }),
        { cuenta: "linkedin", estado: "vencida" },
      ],
      avisosActivos: true,
      ahora: AHORA,
      zona: "America/Santiago",
    })
    expect(estado.titulo).toBe("Instagram dejó de estar conectado")
  })
})
```

`tests/unit/presentar-cuentas.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { filaDeCuenta } from "@/lib/ajustes/presentar"

const AHORA = Date.parse("2031-01-01T12:00:00Z")

describe("filaDeCuenta for LinkedIn", () => {
  it("handles a not connected LinkedIn: reads A mano, neutral, never Falta", () => {
    expect(filaDeCuenta({ cuenta: "linkedin", estado: "falta" }, AHORA)).toMatchObject({ estado: "A mano", tono: "neutro" })
  })

  it("shows who it publishes as when connected", () => {
    expect(filaDeCuenta({ cuenta: "linkedin", estado: "lista", nombre: "Coni del Rosario" }, AHORA)).toMatchObject({
      estado: "Conectada",
      detalle: "Publica como Coni del Rosario",
      conectada: true,
    })
  })
})
```

Append to `tests/integration/revisar-cuentas.test.ts` (inside its `describe`, reusing its setup that builds `deps`):

```ts
  it("handles LinkedIn by its expiry without calling it: falta, lista, vence at 14 days, vencida", async () => {
    await pool.query("update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null")
    const sinConectar = await revisarCuentas(deps)
    expect(sinConectar.find((c) => c.cuenta === "linkedin")).toEqual({ cuenta: "linkedin", estado: "falta" })

    await pool.query(
      "update public.ajustes set linkedin_miembro = 'urn:li:person:x', linkedin_nombre = 'Coni', linkedin_conectado_en = now(), linkedin_token_expira_en = $1",
      [new Date(deps.ahora() + 10 * 86_400_000).toISOString()],
    )
    const porVencer = await revisarCuentas(deps)
    expect(porVencer.find((c) => c.cuenta === "linkedin")).toMatchObject({ cuenta: "linkedin", estado: "vence", nombre: "Coni" })

    await pool.query("update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null")
  })
```

(If that file's setup does not export `deps` and `pool`, follow its existing pattern for calling `revisarCuentas`; the
assertion lines stay the same.)

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test:run tests/unit/estado-de-ajustes.test.ts tests/unit/presentar-cuentas.test.ts && pnpm test:db tests/integration/revisar-cuentas.test.ts`
Expected: FAIL (`linkedin` is not a `NombreDeCuenta`).

- [ ] **Step 3: Implement**

`lib/ajustes/estado.ts`:
- `export type NombreDeCuenta = "instagram" | "heygen" | "elevenlabs" | "anthropic" | "linkedin"`.
- `EstadoDeCuenta`: the `lista` member becomes `{ cuenta: NombreDeCuenta; estado: "lista"; nombre?: string | null }`.
- `NOMBRE_DE_CUENTA` gains `linkedin: "LinkedIn"`.
- `PASO_DE_CUENTA` stays a `Record<Exclude<NombreDeCuenta, "linkedin">, string>`, and `ORDEN` keeps its four
  accounts, typed `readonly Exclude<NombreDeCuenta, "linkedin">[]`. LinkedIn is not a setup step (L4).
- Add `export const DIAS_DE_AVISO_DE_LINKEDIN = 14` and `const CONECTAR_LINKEDIN = "/api/linkedin/conectar"`.
- In `bloqueDeAtencion`, branch on `cuenta.cuenta === "linkedin"` before the Instagram texts:

```ts
  if (cuenta.cuenta === "linkedin" && (cuenta.estado === "vence" || cuenta.estado === "vencida")) {
    return {
      tipo: "atencion",
      titulo:
        cuenta.estado === "vence"
          ? `LinkedIn vence ${plazo(cuenta.expiraEn, ahora)}`
          : "LinkedIn dejó de estar conectado",
      texto:
        "Renuévalo para que tus videos sigan saliendo solos en LinkedIn. Mientras tanto, te los dejo listos para subir a mano.",
      accion: { etiqueta: "Renovar LinkedIn", href: CONECTAR_LINKEDIN },
    }
  }
```

- In `estadoDeAjustes`, after `const conProblema = ordenadas.find(...)` (the four accounts), add a LinkedIn check
  that only runs when none of the four has a problem:

```ts
  const linkedin = cuentas.find((c) => c.cuenta === "linkedin")
  if (!conProblema && linkedin && (linkedin.estado === "vence" || linkedin.estado === "vencida")) {
    return { ...bloqueDeAtencion(linkedin, ahora), pasos }
  }
```

`lib/ajustes/revisar.ts`: select `linkedin_miembro, linkedin_nombre, linkedin_token_expira_en` too, and add:

```ts
function linkedin(
  ajustes: { linkedin_miembro: string | null; linkedin_nombre: string | null; linkedin_token_expira_en: string | null },
  ahora: number,
): EstadoDeCuenta {
  if (!ajustes.linkedin_miembro || !ajustes.linkedin_token_expira_en) return { cuenta: "linkedin", estado: "falta" }
  const expiraEn = Date.parse(ajustes.linkedin_token_expira_en)
  if (expiraEn <= ahora) return { cuenta: "linkedin", estado: "vencida" }
  if (expiraEn - ahora <= DIAS_DE_AVISO_DE_LINKEDIN * DIA_MS) {
    return { cuenta: "linkedin", estado: "vence", expiraEn, nombre: ajustes.linkedin_nombre }
  }
  return { cuenta: "linkedin", estado: "lista", nombre: ajustes.linkedin_nombre }
}
```

The `vence` member also carries `nombre?: string | null`, so add it to that union member as well. Then append
`sinCaer("linkedin", async () => linkedin(ajustes, deps.ahora()))` to the returned list. In
`app/(app)/ajustes/revision.ts`, add `"linkedin"` to `CUENTAS`.

`lib/ajustes/presentar.ts`: `FilaDeCuenta` gains `detalle?: string` and `conectada?: boolean`, and `NOMBRE` gains
`linkedin: "LinkedIn"`. At the start of `filaDeCuenta`:

```ts
  if (estado.cuenta === "linkedin") {
    const base = { cuenta: "linkedin" as const, nombre: "LinkedIn" }
    const como = "nombre" in estado && estado.nombre ? { detalle: `Publica como ${estado.nombre}` } : {}
    switch (estado.estado) {
      case "falta":
        return { ...base, estado: "A mano", tono: "neutro", conectada: false }
      case "lista":
        return { ...base, ...como, estado: "Conectada", tono: "ok", conectada: true }
      case "vence": {
        const dias = Math.ceil((estado.expiraEn - ahora) / DIA_MS)
        return { ...base, ...como, estado: dias <= 1 ? "Vence mañana" : `Vence en ${dias} días`, tono: "aviso", conectada: true }
      }
      case "vencida":
        return { ...base, estado: "Desconectada", tono: "error", conectada: true }
      default:
        return { ...base, estado: "Sin revisar", tono: "neutro", conectada: false }
    }
  }
```

(`vencida` keeps `conectada: true` so the row offers "Renovar" and "Desconectar". The token row is still stored.)

- [ ] **Step 4: Run them**

Run: `pnpm test:run tests/unit/estado-de-ajustes.test.ts tests/unit/presentar-cuentas.test.ts && pnpm test:db tests/integration/revisar-cuentas.test.ts && pnpm type`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ajustes "app/(app)/ajustes/revision.ts" tests/unit/estado-de-ajustes.test.ts tests/unit/presentar-cuentas.test.ts tests/integration/revisar-cuentas.test.ts
git commit -m "$(printf 'Muestra LinkedIn en el estado de Ajustes y avisa 14 días antes\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 10: Cuentas UI (connect, renew, disconnect) and "Sale solo" (L4)

**Files:**
- Modify: `app/(app)/ajustes/cuentas-conectadas.tsx`, `app/(app)/ajustes/cuentas/page.tsx`, `app/(app)/ajustes/editor-de-ajustes.tsx`, `app/(app)/ajustes/page.tsx`
- Test: `tests/unit/cuentas-conectadas.test.tsx` (append), `tests/unit/editor-de-ajustes.test.tsx` (append)

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/cuentas-conectadas.test.tsx`:

```tsx
describe("CuentasConectadas, LinkedIn", () => {
  const LINKEDIN_CONECTADO: FilaDeCuenta = {
    cuenta: "linkedin",
    nombre: "LinkedIn",
    estado: "Conectada",
    tono: "ok",
    detalle: "Publica como Coni del Rosario",
    conectada: true,
  }

  it("offers Conectar LinkedIn as a plain link when it goes by hand", () => {
    render(
      <CuentasConectadas
        filas={[{ cuenta: "linkedin", nombre: "LinkedIn", estado: "A mano", tono: "neutro", conectada: false }]}
        guardarLlave={vi.fn()}
        desconectarLinkedin={vi.fn()}
      />,
    )
    expect(screen.getByRole("link", { name: "Conectar LinkedIn" })).toHaveAttribute("href", "/api/linkedin/conectar")
    expect(screen.queryByRole("button", { name: "Desconectar" })).toBeNull()
  })

  it("shows who it publishes as, Renovar and Desconectar when connected", () => {
    render(<CuentasConectadas filas={[LINKEDIN_CONECTADO]} guardarLlave={vi.fn()} desconectarLinkedin={vi.fn()} />)
    expect(screen.getByText("Publica como Coni del Rosario")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Renovar LinkedIn" })).toHaveAttribute("href", "/api/linkedin/conectar")
  })

  it("asks before disconnecting and tells her afterwards", async () => {
    const desconectar = vi.fn(async () => ({ ok: true as const }))
    render(<CuentasConectadas filas={[LINKEDIN_CONECTADO]} guardarLlave={vi.fn()} desconectarLinkedin={desconectar} />)
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }))
    expect(
      screen.getByText("¿Desconectar LinkedIn? Tus videos dejarán de salir solos ahí y te quedarán para subir a mano."),
    ).toBeInTheDocument()
    expect(desconectar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }))
    await waitFor(() => expect(desconectar).toHaveBeenCalledOnce())
    expect(
      await screen.findByText(
        "LinkedIn quedó desconectado. Si quieres, también puedes quitar el permiso desde la configuración de tu cuenta de LinkedIn.",
      ),
    ).toBeInTheDocument()
  })
})
```

(The existing `mostrar` helper must now also pass `desconectarLinkedin={vi.fn()}`.)

Append to `tests/unit/editor-de-ajustes.test.tsx` (follow its render helper; add the new prop `linkedinConectado`):

```tsx
it("says LinkedIn goes out by itself when connected and by hand otherwise", () => {
  const { rerender } = mostrarEditor({ linkedinConectado: true })
  expect(screen.getByText("Sale solo")).toBeInTheDocument()
  rerender(editorCon({ linkedinConectado: false }))
  expect(screen.getByText("A mano")).toBeInTheDocument()
  expect(screen.queryByText("A mano por ahora")).toBeNull()
})
```

(`mostrarEditor`/`editorCon` stand for the file's existing render helper. If it has a single helper, call it twice
with `cleanup()` in between, using the same assertions.)

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test:run tests/unit/cuentas-conectadas.test.tsx tests/unit/editor-de-ajustes.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `cuentas-conectadas.tsx`:
- add the prop `desconectarLinkedin: () => Promise<Resultado>`;
- render `fila.detalle` under the name row as `<p className="text-meta text-apagado">{fila.detalle}</p>`;
- add a branch before the Instagram one:

```tsx
            {fila.cuenta === "linkedin" ? (
              <FilaDeLinkedin
                fila={fila}
                desconectar={desconectarLinkedin}
                alDesconectar={() =>
                  setMensaje(
                    "LinkedIn quedó desconectado. Si quieres, también puedes quitar el permiso desde la configuración de tu cuenta de LinkedIn.",
                  )
                }
              />
            ) : fila.cuenta === "instagram" ? (
```

and add the component:

```tsx
function FilaDeLinkedin({
  fila,
  desconectar,
  alDesconectar,
}: {
  fila: FilaDeCuenta
  desconectar: () => Promise<Resultado>
  alDesconectar: () => void
}) {
  const [preguntando, setPreguntando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const enlace = (
    <a
      href="/api/linkedin/conectar"
      className={clasesDeBoton({ variante: "linea", tamano: "chico", className: "w-fit" })}
    >
      {fila.conectada ? "Renovar LinkedIn" : "Conectar LinkedIn"}
    </a>
  )
  if (!fila.conectada) return <div className="mt-1.5">{enlace}</div>
  if (preguntando) {
    return (
      <div className="mt-2 grid gap-2">
        <ConfirmacionEnLinea
          trato="destructivo"
          pregunta="¿Desconectar LinkedIn? Tus videos dejarán de salir solos ahí y te quedarán para subir a mano."
          confirmar="Desconectar"
          volver="Volver"
          cargando={pendiente}
          alVolver={() => setPreguntando(false)}
          alConfirmar={() =>
            empezar(async () => {
              const resultado = await desconectar()
              if (!resultado.ok) {
                setError(resultado.error)
                return
              }
              setPreguntando(false)
              alDesconectar()
            })
          }
        />
        {error ? <LineaDeEstado tipo="error" titulo={error} /> : null}
      </div>
    )
  }
  return (
    <div className="mt-1.5 flex flex-wrap gap-2">
      {enlace}
      <Boton variante="linea" tamano="chico" onClick={() => setPreguntando(true)}>
        Desconectar
      </Boton>
    </div>
  )
}
```

(Import `ConfirmacionEnLinea` from `@/components/ui/confirmacion-en-linea`. Line 1 stays `"use client"`.)

In `cuentas/page.tsx`, pass `desconectarLinkedin={desconectarLinkedinAccion}` to `<CuentasConectadas>` (import from
`../acciones`), and include `linkedin` in the skeleton count (5 rows).

In `editor-de-ajustes.tsx`, add `linkedinConectado: boolean` to `EditorDeAjustes`'s props. The LinkedIn `detalle`
becomes `linkedinConectado ? "Sale solo" : "A mano"`, and the help paragraph becomes:

```tsx
        <p className="text-meta text-apagado">
          Si LinkedIn está conectado, a la hora aprobada sale solo. Si no, te aviso y te dejo el video y el texto listos
          para subirlo a mano.
        </p>
```

In `app/(app)/ajustes/page.tsx`, add `linkedin_miembro, linkedin_token_expira_en` to the `ajustes` select and pass:

```tsx
          linkedinConectado={
            ajustes.linkedin_miembro !== null &&
            ajustes.linkedin_token_expira_en !== null &&
            Date.parse(ajustes.linkedin_token_expira_en) > Date.now()
          }
```

- [ ] **Step 4: Run them, check the copy**

Run: `pnpm test:run tests/unit/cuentas-conectadas.test.tsx tests/unit/editor-de-ajustes.test.tsx && pnpm type && pnpm lint && grep -n "—" "app/(app)/ajustes/cuentas-conectadas.tsx" "app/(app)/ajustes/editor-de-ajustes.tsx"; head -1 "app/(app)/ajustes/cuentas-conectadas.tsx"`
Expected: PASS. The grep prints nothing, and line 1 is `"use client"`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/ajustes" tests/unit/cuentas-conectadas.test.tsx tests/unit/editor-de-ajustes.test.tsx
git commit -m "$(printf 'Agrega conectar, renovar y desconectar LinkedIn en Cuentas\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 11: Repository for the LinkedIn connection and row

**Files:**
- Modify: `lib/datos/repositorio.ts`, `lib/dominio/destinos.ts` (`PublicacionConEnlace` gains `explicacion`)
- Test: `tests/integration/repositorio-linkedin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import {
  guardarPostLinkedin,
  guardarVideoLinkedin,
  leerConexionLinkedin,
  leerFilaLinkedin,
  leerPublicaciones,
  pasarLinkedinAMano,
  reservarEnvioLinkedin,
  sumarIntentoLinkedin,
} from "@/lib/datos/repositorio"
import { pool } from "./db"
import { crearProgramada, limpiarProgramadas } from "./programadas"
import { clienteDeServicio } from "./servicio"

const db = clienteDeServicio()
afterEach(async () => {
  await limpiarProgramadas()
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})
afterAll(() => pool.end())

const LINKEDIN = { destinos: ["linkedin"] as const, textoLinkedin: "Hola LinkedIn" }

describe("leerConexionLinkedin", () => {
  it("is null without a token, and returns token, member and expiry when connected", async () => {
    expect(await leerConexionLinkedin(db)).toBeNull()
    await pool.query("select vault.create_secret('AQV_token_de_prueba', 'linkedin')")
    await pool.query(
      "update public.ajustes set linkedin_miembro = 'urn:li:person:x', linkedin_conectado_en = now(), linkedin_token_expira_en = '2031-03-01T00:00:00Z'",
    )
    expect(await leerConexionLinkedin(db)).toEqual({
      token: "AQV_token_de_prueba",
      miembro: "urn:li:person:x",
      expiraEn: "2031-03-01T00:00:00+00:00",
    })
  })
})

describe("the LinkedIn row", () => {
  it("walks video, reserve and post, ending publicado with the permalink", async () => {
    const id = await crearProgramada(undefined, LINKEDIN)
    await guardarVideoLinkedin(db, id, "urn:li:video:C1")
    const fila = await leerFilaLinkedin(db, id)
    expect(fila).toMatchObject({ estado: "esperando", videoUrn: "urn:li:video:C1", enviadoEn: null, intentos: 0 })

    const version = (await pool.query("select version from public.piezas where id = $1", [id])).rows[0].version
    expect(await reservarEnvioLinkedin(db, id, version)).toBe(version + 1)
    await guardarPostLinkedin(db, id, { postUrn: "urn:li:share:9", hashEnviado: "h".repeat(64) })

    const [publicacion] = await leerPublicaciones(db, id)
    expect(publicacion).toMatchObject({
      destino: "linkedin",
      estado: "publicado",
      enlace: "https://www.linkedin.com/feed/update/urn:li:share:9/",
    })
  })

  it("counts a failed try, clearing the video when asked, and falls back to manual with a reason", async () => {
    const id = await crearProgramada(undefined, LINKEDIN)
    await guardarVideoLinkedin(db, id, "urn:li:video:C1")
    await sumarIntentoLinkedin(db, id, { error: "PROCESSING_FAILED", borrarVideo: true })
    expect(await leerFilaLinkedin(db, id)).toMatchObject({ intentos: 1, videoUrn: null })

    await pasarLinkedinAMano(db, id, { explicacion: "Razón para Coni.", error: "detalle" })
    const [publicacion] = await leerPublicaciones(db, id)
    expect(publicacion).toMatchObject({ estado: "para_subir", explicacion: "Razón para Coni." })
  })
})
```

- [ ] **Step 2: Extract the scheduled-piece helper** (test support, needed by this and later tasks)

Create `tests/integration/programadas.ts` by moving `crearProgramada`, `PUBLICAR_EN`, `despues`, `piezasCreadas` and
the `OpcionesDeProgramada` type verbatim out of `tests/integration/publicar.test.ts`. Export them, plus:

```ts
export async function limpiarProgramadas(): Promise<void> {
  await pool.query("delete from public.piezas where id = any($1::uuid[])", [piezasCreadas])
  piezasCreadas.length = 0
}
```

In `publicar.test.ts`, import them from `./programadas`, and replace its piece deletion in `afterEach` with
`await limpiarProgramadas()`. Run `pnpm test:db tests/integration/publicar.test.ts`: still PASS.

- [ ] **Step 3: Run the new test to make sure it fails**

Run: `pnpm test:db tests/integration/repositorio-linkedin.test.ts`
Expected: FAIL (`leerConexionLinkedin` is not exported).

- [ ] **Step 4: Implement** (append to `lib/datos/repositorio.ts`; `fallo` and `Db` already exist there)

```ts
import { enlaceDePost, type FilaDeLinkedin } from "@/lib/dominio/linkedin"

export interface ConexionLinkedin {
  token: string
  miembro: string
  expiraEn: string
}

/** Null when LinkedIn was never connected or was disconnected. Expiry is judged by the caller with its clock. */
export async function leerConexionLinkedin(db: Db): Promise<ConexionLinkedin | null> {
  const token = await leerSecreto(db, "linkedin")
  const { data, error } = await db.from("ajustes").select("linkedin_miembro, linkedin_token_expira_en").maybeSingle()
  if (error) throw fallo("No pude leer la conexión de LinkedIn", error)
  if (!token || !data?.linkedin_miembro || !data.linkedin_token_expira_en) return null
  return { token, miembro: data.linkedin_miembro, expiraEn: data.linkedin_token_expira_en }
}

export async function leerFilaLinkedin(db: Db, piezaId: string): Promise<FilaDeLinkedin | null> {
  const { data, error } = await db
    .from("publicaciones")
    .select("estado, video_urn, enviado_en, post_urn, intentos")
    .eq("pieza_id", piezaId)
    .eq("destino", "linkedin")
    .maybeSingle()
  if (error) throw fallo("No pude leer la fila de LinkedIn", error)
  if (!data) return null
  if (!esEstadoDePublicacion(data.estado)) throw new Error(`Estado de publicación desconocido: ${data.estado}`)
  return {
    estado: data.estado,
    videoUrn: data.video_urn,
    enviadoEn: data.enviado_en,
    postUrn: data.post_urn,
    intentos: data.intentos,
  }
}

/** Every write targets the waiting row only: a row she marked, or that fell back, is never touched again. */
async function escribirFilaLinkedin(
  db: Db,
  piezaId: string,
  cambios: Database["public"]["Tables"]["publicaciones"]["Update"],
  que: string,
): Promise<void> {
  const { data, error } = await db
    .from("publicaciones")
    .update(cambios)
    .eq("pieza_id", piezaId)
    .eq("destino", "linkedin")
    .eq("estado", "esperando")
    .select("pieza_id")
  if (error) throw fallo(`No pude ${que} en LinkedIn`, error)
  if (data.length !== 1) throw new Error(`La fila de LinkedIn de la pieza ${piezaId} dejó de esperar (${que}).`)
}

export function guardarVideoLinkedin(db: Db, piezaId: string, videoUrn: string): Promise<void> {
  return escribirFilaLinkedin(db, piezaId, { video_urn: videoUrn }, "guardar el video")
}

export async function sumarIntentoLinkedin(
  db: Db,
  piezaId: string,
  entrada: { error: string; borrarVideo: boolean },
): Promise<void> {
  const fila = await leerFilaLinkedin(db, piezaId)
  if (!fila) throw new Error(`La pieza ${piezaId} no tiene fila de LinkedIn.`)
  await escribirFilaLinkedin(
    db,
    piezaId,
    { intentos: fila.intentos + 1, ultimo_error: entrada.error.slice(0, 500), ...(entrada.borrarVideo ? { video_urn: null } : {}) },
    "contar el intento",
  )
}

/** L6.6: returns the piece version the run holds from now on. */
export async function reservarEnvioLinkedin(db: Db, piezaId: string, version: number): Promise<number> {
  const { data, error } = await db.rpc("reservar_envio_linkedin", { p_pieza: piezaId, p_version: version })
  if (error) throw fallo("No pude reservar el envío a LinkedIn", error)
  return data
}

export function guardarPostLinkedin(
  db: Db,
  piezaId: string,
  entrada: { postUrn: string; hashEnviado: string },
): Promise<void> {
  return escribirFilaLinkedin(
    db,
    piezaId,
    {
      estado: "publicado",
      post_urn: entrada.postUrn,
      enlace: enlaceDePost(entrada.postUrn),
      hash_enviado: entrada.hashEnviado,
      marcado_en: new Date().toISOString(),
      explicacion: null,
    },
    "guardar el post",
  )
}

export function pasarLinkedinAMano(db: Db, piezaId: string, entrada: { explicacion: string; error: string }): Promise<void> {
  return escribirFilaLinkedin(
    db,
    piezaId,
    { estado: "para_subir", explicacion: entrada.explicacion, ultimo_error: entrada.error.slice(0, 500) },
    "dejarla para subir a mano",
  )
}
```

Also:
- in `leerPublicaciones`, select `destino, estado, enlace, explicacion` and return `explicacion`;
- in `lib/dominio/destinos.ts`, `PublicacionConEnlace` gains `explicacion: string | null`;
- import `esEstadoDePublicacion` and `Database` if they are not already imported in the repository.

- [ ] **Step 5: Run it**

Run: `pnpm test:db tests/integration/repositorio-linkedin.test.ts tests/integration/publicar.test.ts && pnpm test:run && pnpm type`
Expected: PASS (fix any screen fixture that builds a `PublicacionConEnlace` by adding `explicacion: null`).

- [ ] **Step 6: Commit**

```bash
git add lib/datos/repositorio.ts lib/dominio/destinos.ts tests/integration/programadas.ts tests/integration/publicar.test.ts tests/integration/repositorio-linkedin.test.ts tests
git commit -m "$(printf 'Agrega lecturas y escrituras de la fila de LinkedIn\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 12: `resolverLinkedin`, happy path and idempotency (L6 steps 1 to 7, L10)

**Files:**
- Create: `lib/publicacion/linkedin.ts`
- Modify: `lib/publicacion/publicar.ts` (export what `linkedin.ts` needs, call it from `procesar`, `DepsPublicacion.sondeoLinkedin`)
- Test: `tests/integration/publicar-linkedin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"
import { AVISO_AVATAR_LINKEDIN } from "@/lib/dominio/revision"
import { almacenEnMemoria } from "@/lib/proveedores/almacen"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { type DepsPublicacion, publicarPendientes } from "@/lib/publicacion/publicar"
import { simularLinkedin } from "../linkedin-msw"
import { pool } from "./db"
import { VIDEO } from "./flujo"
import { crearProgramada, despues, limpiarProgramadas } from "./programadas"
import { clienteDeServicio } from "./servicio"
import { publicacionesDe } from "./siembra"

afterAll(() => pool.end())

const TEXTO_LINKEDIN = `¿Te cuesta poner límites (incluso con tu familia)?\n\n${AVISO_AVATAR_LINKEDIN}\n\n#SaludMental`
const SOLO_LINKEDIN = { destinos: ["linkedin"] as const, textoLinkedin: TEXTO_LINKEDIN }
const VIDEO_BYTES = new Uint8Array(100_000)

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

async function conectarLinkedin(expira = "2031-12-31T00:00:00Z") {
  await pool.query("select vault.create_secret('AQV_token_de_prueba', 'linkedin')")
  await pool.query(
    "update public.ajustes set linkedin_miembro = 'urn:li:person:abc123XYZ', linkedin_nombre = 'Coni', linkedin_conectado_en = now(), linkedin_token_expira_en = $1",
    [expira],
  )
}

async function estadoDe(id: string) {
  return (await pool.query("select estado, version from public.piezas where id = $1", [id])).rows[0]
}

beforeEach(async () => {
  await conectarLinkedin()
})
afterEach(async () => {
  await limpiarProgramadas()
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})

describe("publicarPendientes with LinkedIn connected", () => {
  it("uploads the approved video, posts the approved text as little text and closes the piece", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin({ estados: ["PROCESSING", "AVAILABLE"] })
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])

    expect(sim.iniciadas).toHaveLength(1)
    expect(sim.posts).toHaveLength(1)
    expect(sim.posts[0]).toMatchObject({
      author: "urn:li:person:abc123XYZ",
      commentary: expect.stringContaining("\\(incluso con tu familia\\)"),
      content: { media: { id: "urn:li:video:C5505AQprueba" } },
    })
    expect(String(sim.posts[0]?.commentary)).toContain("{hashtag|\\#|SaludMental}")
    const [fila] = await publicacionesDe(id)
    expect(fila).toMatchObject({
      destino: "linkedin",
      estado: "publicado",
      post_urn: "urn:li:share:71",
      enlace: "https://www.linkedin.com/feed/update/urn:li:share:71/",
    })
    expect((await estadoDe(id)).estado).toBe("publicado")
    expect(d.avisos.aConiEnviados.map((a) => a.mensaje)).toContainEqual(
      expect.stringContaining("ya está publicado en LinkedIn. Míralo aquí: https://www.linkedin.com/feed/update/urn:li:share:71/"),
    )
  })

  it("leaves the piece programado while the video is processing and resumes without uploading again", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin({ estados: ["PROCESSING"] })
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
    expect((await estadoDe(id)).estado).toBe("programado")
    expect(sim.posts).toHaveLength(0)

    const sim2 = simularLinkedin({ estados: ["AVAILABLE"] })
    await pool.query("update public.piezas set publicacion_reclamada_hasta = null where id = $1", [id])
    expect(await publicarPendientes(doble(() => despues(6)).deps)).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect(sim2.iniciadas).toHaveLength(0)
    expect(sim2.posts).toHaveLength(1)
  })

  it("never posts again when a previous run reserved the send and lost the answer", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    await pool.query(
      "update public.publicaciones set video_urn = 'urn:li:video:C1', enviado_en = now() where pieza_id = $1",
      [id],
    )
    const sim = simularLinkedin()
    const d = doble(() => despues(1))

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.posts).toHaveLength(0)
    const [fila] = await publicacionesDe(id)
    expect(fila).toMatchObject({ estado: "para_subir" })
    expect(fila.explicacion).toBe(
      "No pude confirmar si LinkedIn publicó tu video. Revisa tu perfil de LinkedIn: si no está, súbelo a mano desde aquí.",
    )
    expect(d.avisos.aWavEnviados).toHaveLength(1)
  })

  it("posts nothing when the LinkedIn text changed after gate 2", async () => {
    const id = await crearProgramada(undefined, { ...SOLO_LINKEDIN, aprobadoSobre: "otro texto aprobado" })
    const sim = simularLinkedin()
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "falla_publicacion" }])
    expect(sim.iniciadas).toHaveLength(0)
    expect(sim.posts).toHaveLength(0)
  })

  it("goes by hand without calling LinkedIn when it is not connected (phase 1 behavior)", async () => {
    await pool.query("delete from vault.secrets where name = 'linkedin'")
    await pool.query(
      "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
    )
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin()
    expect(await publicarPendientes(doble(() => despues(1)).deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.iniciadas).toHaveLength(0)
  })

  it("goes by hand with a reason when the connection expired", async () => {
    await pool.query("update public.ajustes set linkedin_token_expira_en = '2031-03-14T21:00:00Z'")
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin()
    const d = doble(() => despues(1))
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.iniciadas).toHaveLength(0)
    expect(d.avisos.aConiEnviados[0]?.mensaje).toContain("LinkedIn no está conectado, así que te lo dejé para subir a mano.")
  })
})
```

`notificadorEnMemoria` records sends. If its recorded arrays have other names (check
`lib/proveedores/avisos.ts:37-70`), use those names. `aConiEnviados`/`aWavEnviados` stand for them.

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test:db tests/integration/publicar-linkedin.test.ts`
Expected: FAIL (`sondeoLinkedin` is not in `DepsPublicacion`; the pieces go by hand).

- [ ] **Step 3: Implement `lib/publicacion/linkedin.ts`**

```ts
import { hashTexto, puedePublicar, type Veredicto } from "@/lib/dominio/puertas"
import { aLittleText, siguientePasoLinkedin } from "@/lib/dominio/linkedin"
import { AVISO_AVATAR_LINKEDIN } from "@/lib/dominio/revision"
import { piezaDesdeFila } from "@/lib/datos/piezas"
import {
  type ConexionLinkedin,
  guardarPostLinkedin,
  guardarVideoLinkedin,
  leerConexionLinkedin,
  leerFilaLinkedin,
  leerPieza,
  pasarLinkedinAMano,
  reservarEnvioLinkedin,
  sumarIntentoLinkedin,
} from "@/lib/datos/repositorio"
import {
  crearPost,
  estadoDelVideo,
  RechazoDeLinkedin,
  subirVideo,
  TokenDeLinkedinVencido,
} from "@/lib/proveedores/linkedin"
import type { Contexto } from "./publicar"
import { destinosDe, hashTextoActual } from "./publicar"

export const EXPLICACION_LINKEDIN_DUDOSA =
  "No pude confirmar si LinkedIn publicó tu video. Revisa tu perfil de LinkedIn: si no está, súbelo a mano desde aquí."
export const EXPLICACION_LINKEDIN_TARDE =
  "No alcancé a publicarlo en LinkedIn dentro de la media hora que aprobaste, así que te lo dejé para subir a mano."
export const EXPLICACION_LINKEDIN_RECONECTAR =
  "LinkedIn pidió conectar de nuevo tu cuenta, así que te lo dejé para subir a mano. Renueva LinkedIn en Ajustes para los próximos."
export const EXPLICACION_LINKEDIN_GENERICA =
  "LinkedIn no aceptó la publicación, así que te la dejé para subir a mano. WAV ya está revisando."
export const EXPLICACION_LINKEDIN_VIDEO =
  "LinkedIn no acepta este video (tamaño fuera de lo permitido), así que te lo dejé para subir a mano. WAV ya está revisando."
export const LINKEDIN_SIN_CONEXION = "LinkedIn no está conectado, así que te lo dejé para subir a mano."

/** F5: 75 KB to 500 MB. */
const BYTES_MINIMOS = 75 * 1024
const BYTES_MAXIMOS = 500 * 1024 * 1024

export type ResultadoLinkedin =
  | { tipo: "nada"; sinConexion?: boolean }
  | { tipo: "listo" }
  | { tipo: "a_mano" }
  | { tipo: "en_curso" }
  /** The gate refused for the whole piece: `publicar.ts` settles it as for Instagram. */
  | { tipo: "guardia"; veredicto: Exclude<Veredicto, { ok: true }> }

async function aMano(contexto: Contexto, explicacion: string, detalle: string): Promise<ResultadoLinkedin> {
  const { db, avisos } = contexto.deps
  await pasarLinkedinAMano(db, contexto.fila.id, { explicacion, error: detalle })
  try {
    await avisos.aWav("LinkedIn no publicó un reel", `pieza ${contexto.fila.id} («${contexto.fila.titulo}»): ${detalle}`)
  } catch (error) {
    if (!(error instanceof Error)) throw error
    contexto.avisosFallidos.push(error)
  }
  return { tipo: "a_mano" }
}

/** A provider error before the send: definitive ones go by hand at once, temporary ones count a try. */
async function antesDeEnviar(contexto: Contexto, error: unknown, borrarVideo: boolean): Promise<ResultadoLinkedin> {
  if (error instanceof TokenDeLinkedinVencido) return aMano(contexto, EXPLICACION_LINKEDIN_RECONECTAR, error.message)
  if (error instanceof RechazoDeLinkedin) return aMano(contexto, EXPLICACION_LINKEDIN_GENERICA, error.message)
  if (!(error instanceof Error)) throw error
  await sumarIntentoLinkedin(contexto.deps.db, contexto.fila.id, { error: error.message, borrarVideo })
  return { tipo: "en_curso" }
}

function vigente(contexto: Contexto, texto: string): Veredicto {
  return puedePublicar(piezaDesdeFila(contexto.fila), {
    hashTexto: hashTextoActual(contexto.fila, texto),
    ahora: contexto.deps.ahora(),
  })
}

/** L6: one resumable step of the LinkedIn row per call. Never sends a post twice, never sends what was not approved. */
export async function resolverLinkedin(contexto: Contexto): Promise<ResultadoLinkedin> {
  const { db, ahora } = contexto.deps
  const { fila } = contexto
  if (!destinosDe(fila).includes("linkedin")) return { tipo: "nada" }
  const filaLinkedin = await leerFilaLinkedin(db, fila.id)
  if (!filaLinkedin || filaLinkedin.estado !== "esperando") return { tipo: "nada" }

  const conexion = await leerConexionLinkedin(db)
  if (!conexion) return { tipo: "nada" }
  if (Date.parse(conexion.expiraEn) <= Date.parse(ahora())) return { tipo: "nada", sinConexion: true }

  const paso = siguientePasoLinkedin(filaLinkedin)
  if (paso.tipo === "nada") return { tipo: "nada" }
  if (paso.tipo === "dudosa") return aMano(contexto, EXPLICACION_LINKEDIN_DUDOSA, "un envío anterior no devolvió el post")
  if (paso.tipo === "a_mano") return aMano(contexto, EXPLICACION_LINKEDIN_GENERICA, "se agotaron los intentos")

  const texto = fila.texto
  const textoLinkedin = fila.texto_linkedin
  if (texto === null || fila.puerta2_formula !== 2 || !textoLinkedin?.trim()) {
    return { tipo: "guardia", veredicto: { ok: false, motivo: "artefacto_cambio" } }
  }
  const veredicto = vigente(contexto, texto)
  if (!veredicto.ok) {
    if (veredicto.motivo === "hora_vencida") return aMano(contexto, EXPLICACION_LINKEDIN_TARDE, "pasó la media hora")
    return { tipo: "guardia", veredicto }
  }
  if (!textoLinkedin.includes(AVISO_AVATAR_LINKEDIN)) {
    return aMano(contexto, EXPLICACION_LINKEDIN_GENERICA, "el texto aprobado no trae el aviso del avatar")
  }
  const videoId = piezaDesdeFila(fila).puerta2?.videoId
  if (!videoId) return { tipo: "guardia", veredicto: { ok: false, motivo: "sin_aprobacion" } }

  let videoUrn = filaLinkedin.videoUrn
  if (paso.tipo === "subir_video") {
    const datos = await contexto.deps.almacen.bajar(videoId)
    if (datos.byteLength < BYTES_MINIMOS || datos.byteLength > BYTES_MAXIMOS) {
      return aMano(contexto, EXPLICACION_LINKEDIN_VIDEO, `el video pesa ${datos.byteLength} bytes`)
    }
    try {
      videoUrn = await subirVideo({ token: conexion.token, miembro: conexion.miembro, datos })
    } catch (error) {
      return antesDeEnviar(contexto, error, false)
    }
    await guardarVideoLinkedin(db, fila.id, videoUrn)
  }
  if (videoUrn === null) throw new Error(`La fila de LinkedIn de la pieza ${fila.id} quedó sin video.`)

  const listo = await esperarVideo(contexto, conexion, videoUrn)
  if (listo !== true) return listo

  return enviar(contexto, conexion, { videoUrn, textoLinkedin, texto })
}

async function esperarVideo(
  contexto: Contexto,
  conexion: ConexionLinkedin,
  videoUrn: string,
): Promise<true | ResultadoLinkedin> {
  const { sondeoLinkedin, dormir } = contexto.deps
  for (let lectura = 0; lectura < sondeoLinkedin.veces; lectura += 1) {
    let estado: Awaited<ReturnType<typeof estadoDelVideo>>
    try {
      estado = await estadoDelVideo({ token: conexion.token, video: videoUrn })
    } catch (error) {
      return antesDeEnviar(contexto, error, false)
    }
    if (estado.estado === "listo") return true
    if (estado.estado === "fallido") {
      await sumarIntentoLinkedin(contexto.deps.db, contexto.fila.id, {
        error: `PROCESSING_FAILED: ${estado.detalle}`,
        borrarVideo: true,
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
  aprobado: { videoUrn: string; textoLinkedin: string; texto: string },
): Promise<ResultadoLinkedin> {
  const { db } = contexto.deps
  // Polling takes time: the window and what was approved are checked again with the clock of this moment.
  const actual = await leerPieza(db, contexto.fila.id)
  if (!actual) throw new Error(`La pieza ${contexto.fila.id} desapareció mientras se publicaba en LinkedIn.`)
  contexto.fila = actual
  if (actual.texto_linkedin !== aprobado.textoLinkedin || actual.texto !== aprobado.texto) {
    return { tipo: "guardia", veredicto: { ok: false, motivo: "artefacto_cambio" } }
  }
  const ultimo = vigente(contexto, aprobado.texto)
  if (!ultimo.ok) {
    if (ultimo.motivo === "hora_vencida") return aMano(contexto, EXPLICACION_LINKEDIN_TARDE, "pasó la media hora")
    return { tipo: "guardia", veredicto: ultimo }
  }

  // From here on the post is never sent again (L10): the version lock also proves nothing changed since the check.
  const version = await reservarEnvioLinkedin(db, actual.id, actual.version)
  contexto.fila = { ...actual, version }

  let postUrn: string
  try {
    postUrn = await crearPost({
      token: conexion.token,
      miembro: conexion.miembro,
      video: aprobado.videoUrn,
      commentary: aLittleText(aprobado.textoLinkedin),
    })
  } catch (error) {
    if (!(error instanceof Error)) throw error
    return aMano(contexto, EXPLICACION_LINKEDIN_DUDOSA, `después de enviar: ${error.message}`)
  }
  await guardarPost(contexto, postUrn, hashTexto(aprobado.textoLinkedin))
  return { tipo: "listo" }
}

/** Saves the URN of the live post, retrying: a lost write must reach WAV with the URN, never become a second post. */
async function guardarPost(contexto: Contexto, postUrn: string, hashEnviado: string): Promise<void> {
  let ultimo: unknown
  for (let intento = 0; intento < 3; intento += 1) {
    try {
      await guardarPostLinkedin(contexto.deps.db, contexto.fila.id, { postUrn, hashEnviado })
      return
    } catch (error) {
      ultimo = error
    }
  }
  throw new Error(`Publicado en LinkedIn pero no pude guardar el post: pieza ${contexto.fila.id}, ${postUrn}.`, {
    cause: ultimo,
  })
}
```

- [ ] **Step 4: Wire it into `publicar.ts`**

(`linkedin.ts` and `publicar.ts` import each other. That is safe because neither uses the other at module top level,
only inside functions.)

- Export `Contexto`, `destinosDe` and `hashTextoActual` (add `export` to the existing declarations).
- `DepsPublicacion` gains `sondeoLinkedin: { cadaMs: number; veces: number }`. Its doc comment:
  "LinkedIn usually finishes a short reel within a minute or two; what is not ready is resumed by the next tick."
- Add the notice for LinkedIn and the closing step:

```ts
async function avisarLinkedinPublicado(contexto: Contexto): Promise<void> {
  const enlace = (await leerPublicaciones(contexto.deps.db, contexto.fila.id)).find((p) => p.destino === "linkedin")?.enlace
  const mensaje = `Tu reel «${contexto.fila.titulo}» ya está publicado en LinkedIn. Míralo aquí: ${enlace ?? ""}`
  await avisar(contexto, () => contexto.deps.avisos.aConi(mensaje, false, avisoDe(contexto, "publicado", "linkedin")))
}

/** L7: nothing is left to upload. A destination she uploaded by hand makes it `publicado_a_mano`. */
async function cerrarPublicada(contexto: Contexto): Promise<ResultadoPublicacion> {
  const filas = await leerPublicaciones(contexto.deps.db, contexto.fila.id)
  const algunoAMano = filas.some((p) => p.estado === "subido_a_mano")
  await escribirTransicion(contexto, { tipo: "publicado", algunoAMano })
  return { piezaId: contexto.fila.id, resultado: "publicada" }
}
```

- `procesar` becomes:

```ts
async function procesar(contexto: Contexto): Promise<ResultadoPublicacion> {
  try {
    const linkedin = await resolverLinkedin(contexto)
    if (linkedin.tipo === "en_curso") return { piezaId: contexto.fila.id, resultado: "esperando" }
    if (linkedin.tipo === "guardia") return await rechazarPorElGuardia(contexto, linkedin.veredicto)
    if (linkedin.tipo === "listo") await avisarLinkedinPublicado(contexto)
    contexto.sinLinkedin = linkedin.tipo === "nada" && linkedin.sinConexion === true

    const pendientes = await pendientesDe(contexto)
    if (pendientes.includes("instagram")) {
      const conexion = await contexto.conexion()
      if (conexion.tipo === "nunca" && sinRastroEnInstagram(contexto)) return await entregarParaSubir(contexto)
      if (conexion.tipo !== "conectada") {
        return await fallar(contexto, EXPLICACION_RECONECTAR, "Falta el token de Instagram (secreto meta) o la cuenta.")
      }
      return await publicarPieza(contexto, conexion)
    }
    if (pendientes.length === 0) return await cerrarPublicada(contexto)
    return await entregarParaSubir(contexto)
  } catch (error) {
    if (error instanceof Rechazo) {
      return await fallar(contexto, error.explicacion, error.detalle, { envioRechazado: error.envioRechazado })
    }
    throw error
  }
}
```

  (`Contexto` gains `sinLinkedin?: boolean`.)
- `entregarParaSubir`: build the message from the rows, adding the reasons and the published LinkedIn link:

```ts
  const filas = await leerPublicaciones(contexto.deps.db, contexto.fila.id)
  const razones = filas.filter((p) => p.estado === "para_subir" && p.explicacion).map((p) => p.explicacion)
  const linkedinPublicado = filas.find((p) => p.destino === "linkedin" && p.estado === "publicado")
  const extras = [
    ...razones,
    ...(contexto.sinLinkedin ? [LINKEDIN_SIN_CONEXION] : []),
    ...(linkedinPublicado?.enlace ? [`Ya salió en LinkedIn: ${linkedinPublicado.enlace}`] : []),
  ]
  const mensaje = [
    `Tu reel «${contexto.fila.titulo}» está listo para que lo subas a ${await pendientesPorSubir(contexto)}. Entra a la app para descargar el video y copiar el texto.`,
    ...extras,
  ].join(" ")
```

  The rows are read **after** the transition: the reasons survive it, since the trigger only changes `estado`.
- `confirmar` (Instagram): append the LinkedIn reason when `quedaLinkedin`, by reading the LinkedIn row's
  `explicacion` and adding it after the existing "Falta subirlo a LinkedIn..." sentence when present.
- `trigger/publicar-pendientes.ts` stays as is. `lib/produccion/deps-reales.ts` `depsPublicacion` gains
  `sondeoLinkedin: { cadaMs: 15_000, veces: 8 }`. The tests in `tests/integration/publicar.test.ts` gain the same
  field in their `doble`.

- [ ] **Step 5: Run it**

Run: `pnpm test:db tests/integration/publicar-linkedin.test.ts tests/integration/publicar.test.ts && pnpm type`
Expected: PASS (all phase 1 Instagram and handover tests still pass).

- [ ] **Step 6: Commit**

```bash
git add lib/publicacion lib/produccion/deps-reales.ts tests/integration/publicar-linkedin.test.ts tests/integration/publicar.test.ts
git commit -m "$(printf 'Publica en LinkedIn a la hora aprobada sin repetir nunca un post\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 13: Failures fall back to manual (L6 step 8, L9)

**Files:**
- Test: `tests/integration/publicar-linkedin.test.ts` (append)
- Modify: `lib/publicacion/linkedin.ts` only if a test exposes a gap

- [ ] **Step 1: Write the failing tests** (append to the `describe` of Task 12)

```ts
  it.each([
    [401, "LinkedIn pidió conectar de nuevo tu cuenta, así que te lo dejé para subir a mano. Renueva LinkedIn en Ajustes para los próximos."],
    [403, "LinkedIn no aceptó la publicación, así que te la dejé para subir a mano. WAV ya está revisando."],
    [426, "LinkedIn no aceptó la publicación, así que te la dejé para subir a mano. WAV ya está revisando."],
  ])("handles %s on the upload when LinkedIn refuses: by hand with its reason, WAV told", async (status, explicacion) => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    simularLinkedin({ iniciar: () => HttpResponse.json({ status }, { status }) })
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    const [fila] = await publicacionesDe(id)
    expect(fila).toMatchObject({ estado: "para_subir", explicacion })
    expect(d.avisos.aConiEnviados[0]?.mensaje).toContain(explicacion)
    expect(d.avisos.aWavEnviados).toHaveLength(1)
  })

  it("counts temporary failures and goes by hand after three", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    for (let tick = 0; tick < 3; tick += 1) {
      simularLinkedin({ iniciar: () => new HttpResponse(null, { status: 503 }) })
      const d = doble(() => despues(1 + tick * 5))
      await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")
      await pool.query("update public.piezas set publicacion_reclamada_hasta = null where id = $1", [id])
      expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
    }
    const sim = simularLinkedin()
    await pool.query("update public.piezas set publicacion_reclamada_hasta = null where id = $1", [id])
    expect(await publicarPendientes(doble(() => despues(16)).deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.iniciadas).toHaveLength(0)
    expect((await publicacionesDe(id))[0]).toMatchObject({ estado: "para_subir", intentos: 3 })
  })

  it("re-uploads after a failed processing, keeping count", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    simularLinkedin({ estados: ["PROCESSING_FAILED"] })
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "esperando" }])
    expect((await publicacionesDe(id))[0]).toMatchObject({ video_urn: null, intentos: 1 })
  })

  it.each([
    ["a 500", () => new HttpResponse(null, { status: 500 })],
    ["a 422 duplicate", () => HttpResponse.json({ message: "Content is a duplicate of urn:li:share:1" }, { status: 422 })],
    ["a 201 without id", () => new HttpResponse(null, { status: 201 })],
  ])("handles %s on the post as in doubt: by hand, never sent again", async (_nombre, post) => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin({ post })
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.posts).toHaveLength(1)
    const [fila] = await publicacionesDe(id)
    expect(fila.estado).toBe("para_subir")
    expect(fila.enviado_en).not.toBeNull()
    expect(fila.explicacion).toBe(
      "No pude confirmar si LinkedIn publicó tu video. Revisa tu perfil de LinkedIn: si no está, súbelo a mano desde aquí.",
    )
  })

  it("goes by hand when the half hour passed before sending, and never posts late", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin()
    const d = doble(() => despues(31))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.iniciadas).toHaveLength(0)
    expect((await publicacionesDe(id))[0]?.explicacion).toBe(
      "No alcancé a publicarlo en LinkedIn dentro de la media hora que aprobaste, así que te lo dejé para subir a mano.",
    )
  })

  it("goes by hand when the video is under LinkedIn's minimum size", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    const sim = simularLinkedin()
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, new Uint8Array(1000), "video/mp4")
    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(sim.iniciadas).toHaveLength(0)
  })

  it("never sends a token to WAV or Coni", async () => {
    const id = await crearProgramada(undefined, SOLO_LINKEDIN)
    simularLinkedin({ iniciar: () => HttpResponse.json({ eco: "AQV_token_de_prueba" }, { status: 400 }) })
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")
    await publicarPendientes(d.deps)
    const todo = JSON.stringify([d.avisos.aConiEnviados, d.avisos.aWavEnviados, await publicacionesDe(id)])
    expect(todo).not.toContain("AQV_token_de_prueba")
  })
```

(Add `import { HttpResponse } from "msw"` at the top.)

- [ ] **Step 2: Run them**

Run: `pnpm test:db tests/integration/publicar-linkedin.test.ts`
Expected: the cases already covered by Task 12's code PASS. Any that FAIL show a real gap: fix it in
`lib/publicacion/linkedin.ts` (minimal change) and run again until all PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/publicar-linkedin.test.ts lib/publicacion/linkedin.ts
git commit -m "$(printf 'Deja LinkedIn para subir a mano con su razón cuando algo falla\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 14: Mixed pieces with Instagram (L7)

**Files:**
- Test: `tests/integration/publicar-linkedin.test.ts` (append a new `describe`)
- Modify: `lib/publicacion/publicar.ts` only if a test exposes a gap

- [ ] **Step 1: Write the failing tests**

```ts
describe("Instagram and LinkedIn together", () => {
  const AMBOS = { destinos: ["instagram", "linkedin"] as const, textoLinkedin: TEXTO_LINKEDIN }

  it("posts LinkedIn and hands Instagram over when Instagram is not connected", async () => {
    const id = await crearProgramada(undefined, AMBOS)
    simularLinkedin()
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    const filas = await publicacionesDe(id)
    expect(filas.find((f) => f.destino === "linkedin")).toMatchObject({ estado: "publicado" })
    expect(filas.find((f) => f.destino === "instagram")).toMatchObject({ estado: "para_subir" })
    const mensajes = d.avisos.aConiEnviados.map((a) => a.mensaje)
    expect(mensajes.some((m) => m.includes("listo para que lo subas a Instagram"))).toBe(true)
    expect(mensajes.some((m) => m.includes("Ya salió en LinkedIn: https://www.linkedin.com/feed/update/"))).toBe(true)
  })

  it("closes as publicado_a_mano when Instagram was uploaded by hand early and LinkedIn goes out by itself", async () => {
    const id = await crearProgramada(undefined, AMBOS)
    await pool.query(
      "update public.publicaciones set estado = 'subido_a_mano', marcado_en = now() where pieza_id = $1 and destino = 'instagram'",
      [id],
    )
    simularLinkedin()
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "publicada" }])
    expect((await estadoDe(id)).estado).toBe("publicado_a_mano")
  })

  it("hands both over with LinkedIn's reason when LinkedIn falls back and Instagram is by hand", async () => {
    const id = await crearProgramada(undefined, AMBOS)
    simularLinkedin({ iniciar: () => HttpResponse.json({}, { status: 403 }) })
    const d = doble(() => despues(1))
    await d.almacen.subir(VIDEO, VIDEO_BYTES, "video/mp4")

    expect(await publicarPendientes(d.deps)).toEqual([{ piezaId: id, resultado: "para_subir_a_mano" }])
    expect(d.avisos.aConiEnviados[0]?.mensaje).toContain("Instagram y LinkedIn")
    expect(d.avisos.aConiEnviados[0]?.mensaje).toContain("LinkedIn no aceptó la publicación")
  })
})
```

- [ ] **Step 2: Run them**

Run: `pnpm test:db tests/integration/publicar-linkedin.test.ts tests/integration/publicar.test.ts`
Expected: PASS. If one fails, fix it in `publicar.ts` with the minimal change and run again.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/publicar-linkedin.test.ts lib/publicacion/publicar.ts
git commit -m "$(printf 'Combina LinkedIn automático con Instagram a mano o conectado\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 15: Nightly expiry notices and version alert (L1, L4)

**Files:**
- Create: `lib/mantenimiento/token-linkedin.ts`
- Modify: `lib/mantenimiento/ejecutar.ts`
- Test: `tests/integration/token-linkedin.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { mantenerTokenLinkedin } from "@/lib/mantenimiento/token-linkedin"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

const DIA = 86_400_000
const AHORA = "2026-10-08T06:00:00.000Z"

afterEach(async () => {
  await pool.query("delete from vault.secrets where name = 'linkedin'")
  await pool.query(
    "update public.ajustes set linkedin_miembro = null, linkedin_nombre = null, linkedin_token_expira_en = null, linkedin_conectado_en = null",
  )
})
afterAll(() => pool.end())

async function conectadaHasta(ms: number) {
  await pool.query("select vault.create_secret('AQV_token_de_prueba', 'linkedin')")
  await pool.query(
    "update public.ajustes set linkedin_miembro = 'urn:li:person:x', linkedin_conectado_en = now(), linkedin_token_expira_en = $1",
    [new Date(Date.parse(AHORA) + ms).toISOString()],
  )
}

const deps = (avisos = notificadorEnMemoria(), ahora = AHORA) => ({ db: clienteDeServicio(), avisos, ahora: () => ahora })

describe("mantenerTokenLinkedin", () => {
  it("does nothing without a connection", async () => {
    expect(await mantenerTokenLinkedin(deps())).toBe("sin_conexion")
  })

  it("does nothing with more than 14 days left", async () => {
    await conectadaHasta(20 * DIA)
    const avisos = notificadorEnMemoria()
    expect(await mantenerTokenLinkedin(deps(avisos))).toBe("vigente")
    expect(avisos.aConiEnviados).toHaveLength(0)
  })

  it.each([
    [10 * DIA, 14, "Tu conexión con LinkedIn vence en 10 días. Entra a Ajustes y toca Renovar LinkedIn: toma un minuto. Si no, tus videos te quedarán para subir a mano."],
    [2 * DIA, 3, "Tu conexión con LinkedIn vence en 2 días. Entra a Ajustes y toca Renovar LinkedIn: toma un minuto. Si no, tus videos te quedarán para subir a mano."],
    [-DIA, 0, "Tu conexión con LinkedIn venció. Mientras no la renueves en Ajustes, tus videos de LinkedIn te quedarán para subir a mano."],
  ])("handles %s ms left when it is the threshold %s: one notice per threshold and token", async (ms, umbral, mensaje) => {
    await conectadaHasta(ms)
    const avisos = notificadorEnMemoria()
    expect(await mantenerTokenLinkedin(deps(avisos))).toBe("avisado")
    expect(avisos.aConiEnviados[0]).toMatchObject({ mensaje, datos: { tipo: "linkedin_por_vencer" } })
    expect(avisos.aConiEnviados[0]?.datos.clave).toMatch(new RegExp(`^linkedin_por_vencer:${umbral}:`))
  })
})
```

(Match the field names of `notificadorEnMemoria`'s records. `datos` stands for the `DatosDeAviso` argument.)

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test:db tests/integration/token-linkedin.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { leerConexionLinkedin } from "@/lib/datos/repositorio"
import { avisoDeVencimientoLinkedin, versionDeLinkedinPorVencer } from "@/lib/dominio/linkedin"
import type { Notificador } from "@/lib/proveedores/avisos"
import { VERSION_DE_LINKEDIN } from "@/lib/proveedores/linkedin"
import type { Database } from "@/lib/supabase/database.types"

export interface DepsTokenLinkedin {
  db: SupabaseClient<Database>
  avisos: Notificador
  ahora: () => string
}

export type ResultadoTokenLinkedin = "sin_conexion" | "vigente" | "avisado"

/**
 * LinkedIn gives a self-serve app no refresh token (F12): Coni renews by connecting again. She is told at 14 days,
 * at 3 days and when it expired, once per threshold and token (the key carries the expiry date).
 */
export async function mantenerTokenLinkedin(deps: DepsTokenLinkedin): Promise<ResultadoTokenLinkedin> {
  if (versionDeLinkedinPorVencer(VERSION_DE_LINKEDIN, deps.ahora())) {
    await deps.avisos.aWav(
      "Hay que subir la versión de la API de LinkedIn",
      `VERSION_DE_LINKEDIN es ${VERSION_DE_LINKEDIN}. Cada versión dura al menos un año: súbela en lib/proveedores/linkedin.ts.`,
    )
  }
  const conexion = await leerConexionLinkedin(deps.db)
  if (!conexion) return "sin_conexion"
  const aviso = avisoDeVencimientoLinkedin(Date.parse(conexion.expiraEn), Date.parse(deps.ahora()))
  if (!aviso) return "vigente"
  const mensaje =
    aviso.umbral === 0
      ? "Tu conexión con LinkedIn venció. Mientras no la renueves en Ajustes, tus videos de LinkedIn te quedarán para subir a mano."
      : `Tu conexión con LinkedIn vence en ${aviso.dias === 1 ? "1 día" : `${aviso.dias} días`}. Entra a Ajustes y toca Renovar LinkedIn: toma un minuto. Si no, tus videos te quedarán para subir a mano.`
  await deps.avisos.aConi(mensaje, true, {
    tipo: "linkedin_por_vencer",
    clave: `linkedin_por_vencer:${aviso.umbral}:${conexion.expiraEn.slice(0, 10)}`,
  })
  return "avisado"
}
```

The version alert repeats every night until someone bumps the constant. That is intended: it is WAV's job and it
must not be missed.

In `lib/mantenimiento/ejecutar.ts`, `DepsNocturno` already includes `db`, `avisos` and `ahora`. Add
`linkedin: () => mantenerTokenLinkedin(deps),` after `token:` in `mantenimientoNocturno`, and update its doc comment
to "Instagram's token, LinkedIn's expiry".

- [ ] **Step 4: Run it**

Run: `pnpm test:db tests/integration/token-linkedin.test.ts tests/integration/token-meta.test.ts && pnpm test:run && pnpm type`
Expected: PASS (fix any test of `mantenimientoNocturno` that lists its steps by adding `linkedin`).

- [ ] **Step 5: Commit**

```bash
git add lib/mantenimiento tests/integration/token-linkedin.test.ts tests
git commit -m "$(printf 'Avisa a Coni 14 y 3 días antes de que venza LinkedIn\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 16: Video screen shows the automatic state (L8)

**Files:**
- Modify: `app/(app)/video/[id]/subir-a-mano.tsx`, the gate-2 destinations section in `app/(app)/video/[id]/` (find it with `grep -ln "Dónde se publica" "app/(app)/video/[id]"`), `app/(app)/video/[id]/page.tsx` (pass `linkedinConectado`)
- Test: `tests/unit/subir-a-mano.test.tsx` (append; find it with `grep -ln "Ya lo subí a LinkedIn" tests/unit`), and the gate-2 component's test

- [ ] **Step 1: Write the failing tests**

```tsx
describe("LinkedIn published by itself or fallen back", () => {
  it("shows Publicado en LinkedIn with its link for an automatic post", () => {
    mostrarSubida({
      publicaciones: [
        { destino: "linkedin", estado: "publicado", enlace: "https://www.linkedin.com/feed/update/urn:li:share:7/", explicacion: null },
      ],
    })
    expect(screen.getByText("Publicado en LinkedIn")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ver en LinkedIn" })).toHaveAttribute(
      "href",
      "https://www.linkedin.com/feed/update/urn:li:share:7/",
    )
  })

  it("shows the reason above the manual steps when LinkedIn fell back", () => {
    mostrarSubida({
      publicaciones: [{ destino: "linkedin", estado: "para_subir", enlace: null, explicacion: "LinkedIn no aceptó la publicación, así que te la dejé para subir a mano. WAV ya está revisando." }],
    })
    expect(screen.getByText(/LinkedIn no aceptó la publicación/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Ya lo subí a LinkedIn" })).toBeInTheDocument()
  })
})
```

For the gate-2 destinations component:

```tsx
it("tells her LinkedIn goes out by itself when connected", () => {
  mostrarDestinos({ linkedinConectado: true })
  expect(screen.getByText("Sale solo a la hora aprobada")).toBeInTheDocument()
})
it("tells her she uploads LinkedIn when it is not connected", () => {
  mostrarDestinos({ linkedinConectado: false })
  expect(screen.getByText("Lo subes tú a la hora aprobada")).toBeInTheDocument()
})
```

(`mostrarSubida`/`mostrarDestinos` stand for each test file's existing render helper. Extend it with the new props.)

- [ ] **Step 2: Run them to make sure they fail**

Run: `pnpm test:run tests/unit/subir-a-mano.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

- In `subir-a-mano.tsx`, for a row with `estado === "publicado"` and `destino === "linkedin"`, render:

```tsx
        <div className="grid gap-1">
          <LineaDeEstado tipo="exito" titulo="Publicado en LinkedIn" />
          {publicacion.enlace ? (
            <a href={publicacion.enlace} target="_blank" rel="noreferrer" className="text-cuerpo font-medium text-tinta underline">
              Ver en LinkedIn
            </a>
          ) : null}
        </div>
```

  Keep phase 1's "Subido a LinkedIn" for `subido_a_mano`. For a `para_subir` row with `explicacion`, render
  `<LineaDeEstado tipo="aviso" titulo={publicacion.explicacion} />` above the existing block.
- In the gate-2 destinations section, under the LinkedIn `Casilla`, add
  `<p className="text-meta text-apagado">{linkedinConectado ? "Sale solo a la hora aprobada" : "Lo subes tú a la hora aprobada"}</p>`.
- `page.tsx` reads `linkedin_miembro, linkedin_token_expira_en` from `ajustes` with Coni's session (RLS already lets
  her read `ajustes`) and passes `linkedinConectado` computed exactly as in Task 10.
- In `programado` with a LinkedIn row `esperando` and `linkedinConectado`, the summary line under the date reads
  "LinkedIn: sale solo a la hora aprobada."

- [ ] **Step 4: Run them, check the copy**

Run: `pnpm test:run && pnpm type && pnpm lint && grep -rn "—" "app/(app)/video/[id]"; head -1 "app/(app)/video/[id]/subir-a-mano.tsx"`
Expected: PASS. The grep prints nothing, and line 1 is `"use client"` when the file was a client file.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/video/[id]" tests/unit
git commit -m "$(printf 'Muestra en el video si LinkedIn sale solo, salió o quedó a mano\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 17: Wiring, docs and full gate

**Files:**
- Modify: `.env.example`, `docs/TRASPASO.md` (one short section), `CLAUDE.md` only if a new trap appeared (keep it ≤ 80 lines)

- [ ] **Step 1: `.env.example`** (no values)

```
# "Conectar LinkedIn" (design 2026-10-07, L1): the LinkedIn app with "Share on LinkedIn" and "Sign In with LinkedIn
# using OpenID Connect". Vercel only (Trigger does not need them). The redirect URI must be exactly the one registered
# in the app: https://<dominio>/api/linkedin/callback
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=
# Local tests only: the fake LinkedIn (refused when VERCEL is set).
LINKEDIN_OAUTH_BASE_URL=
LINKEDIN_API_BASE_URL=
```

- [ ] **Step 2: Full gate**

Run: `pnpm db:reset && pnpm test:run && pnpm test:db && pnpm type && pnpm lint && pnpm build`
Expected: all green. Then run these checks:

```bash
grep -rn "—" lib/publicacion/linkedin.ts lib/ajustes app/api/linkedin "app/(app)/ajustes" "app/(app)/video" lib/mantenimiento/token-linkedin.ts
grep -rln "use client" app | xargs -I{} sh -c 'head -1 "{}" | grep -q "\"use client\"" || echo "falta use client: {}"'
grep -rn "#[0-9a-fA-F]\{3,6\}\b" "app/(app)/ajustes" "app/(app)/video" | grep -v "\.test\."
```

Expected: no output from any of the three.

- [ ] **Step 3: `docs/TRASPASO.md`**: add a section "LinkedIn fase 2 (2026-10-07)" with five lines:
  - where the code lives (`lib/publicacion/linkedin.ts`, `lib/proveedores/linkedin.ts`, `/api/linkedin/*`);
  - the version constant and its nightly alert;
  - the in-doubt rule (never resend);
  - the unverified API facts F3, F9 and F10, and that the smoke checks them;
  - the link to the spec's checklist.

- [ ] **Step 4: Commit**

```bash
git add .env.example docs/TRASPASO.md
git commit -m "$(printf 'Documenta las variables y el traspaso de LinkedIn fase 2\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

## Production checklist (Federico)

1. **LinkedIn app** (spec, "Federico's manual steps"):
   - create the app;
   - add both products;
   - register `https://conidolly.vercel.app/api/linkedin/callback`;
   - load `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` and `LINKEDIN_REDIRECT_URI` into Vercel **production**,
     **from the macOS Terminal app**, and verify their lengths without printing them.

   Nothing goes to Trigger.
2. **Merge** to `main` locally with the full gate green (Task 17, step 2).
3. **Database:** Federico runs `supabase db push` from the macOS Terminal with
   `20261007000100_linkedin_conexion.sql` and `20261007000110_linkedin_publicacion.sql`. Verify:
   - `select proname from pg_proc where proname in ('conectar_linkedin','desconectar_linkedin','linkedin_conectado','reservar_envio_linkedin');`
     returns four rows;
   - `select column_name from information_schema.columns where table_name = 'publicaciones' and column_name in ('video_urn','enviado_en','post_urn');`
     returns three rows.
4. **Vercel first:** push `main`, wait for the production deploy, then log in and check that `/ajustes/cuentas` shows
   the "LinkedIn" row with "A mano" and "Conectar LinkedIn". The old Trigger worker keeps treating LinkedIn as manual
   (phase 1), which is safe.
5. **Trigger second:** `pnpm trigger deploy`. Watch the next `publicar-pendientes` and nightly runs.
6. **Smoke** (with Coni present: only she approves gate 2 and logs into her LinkedIn). This checks F3, F6, F9 and
   F10.
   1. "Conectar LinkedIn" leads to "LinkedIn quedó conectado." and "Publica como ...".
   2. A test piece with only LinkedIn, approved for 10 minutes ahead, at a low-traffic hour.
   3. In Trigger, `publicar-pendientes` should end with the row `publicado` and the notice with the link.
   4. Open the permalink: her profile, the vertical video, the exact text (accents, line breaks, clickable hashtags)
      and the avatar line.
   5. Delete the post by hand on LinkedIn. Mark the piece `descartado` in the app.
   6. If it falls back to manual, read `ultimo_error` (`select ultimo_error from publicaciones where pieza_id = ...`),
      fix, and repeat. Federico deletes any test post by hand.
7. Put a calendar reminder at 46 days (the app also warns at 14 and 3 days).

## Self-review against the spec

- L1: Tasks 5, 6, 7, 15 and 17 · L2: Tasks 5, 7 and 8 · L3: Tasks 1, 7 and 11 · L4: Tasks 1, 8, 9, 10 and 15 ·
  L5: Tasks 2 and 11 · L6: Tasks 3, 6, 12 and 13 · L7: Tasks 4, 12 and 14 · L8: Tasks 10 and 16 · L9: Tasks 12
  (avatar line check) and 16 · L10: Tasks 2, 12 and 13 · L11: phase 1 tests rerun in Tasks 2, 12 and 14.
- Names used across tasks:
  - `aLittleText`, `enlaceDePost`, `esUrnDePost`, `siguientePasoLinkedin`, `MAXIMO_DE_INTENTOS_LINKEDIN`,
    `avisoDeVencimientoLinkedin`, `versionDeLinkedinPorVencer` (Task 3);
  - `SCOPES_DE_LINKEDIN`, `urlDeAutorizacionLinkedin`, `intercambiarCodigoLinkedin`, `leerMiembro` (Task 5);
  - `VERSION_DE_LINKEDIN`, `subirVideo`, `estadoDelVideo`, `crearPost`, `TokenDeLinkedinVencido`,
    `RechazoDeLinkedin`, `RespuestaDudosa` (Task 6);
  - `leerAppDeLinkedin`, `terminarConexionLinkedin`, `desconectarLinkedin`, `desconectarLinkedinAccion` (Task 7);
  - `leerConexionLinkedin`, `leerFilaLinkedin`, `guardarVideoLinkedin`, `sumarIntentoLinkedin`,
    `reservarEnvioLinkedin`, `guardarPostLinkedin`, `pasarLinkedinAMano` (Task 11);
  - `resolverLinkedin`, `cerrarPublicada`, `sondeoLinkedin` (Task 12);
  - `mantenerTokenLinkedin` (Task 15).
- Known soft spots for the executor:
  - the helper names inside existing test files (`mostrar...`, the notifier's recorded arrays) must be matched to
    the real ones;
  - the proteger_pieza, marcar_subido_como_coni and sincronizar_publicaciones bodies are copied verbatim, with only
    the marked blocks changed, and the phase 1 tests rerun in Task 2 step 4 prove the copies.
