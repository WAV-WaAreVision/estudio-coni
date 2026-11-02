# Budget panel and hard limit (change 12a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The monthly cap stops being a brake and becomes a reference with a bar and marks; a hard limit (twice the cap unless Coni sets one) is the only brake. At the limit new work pauses, signed work (voice, video, the shortening of a signed carousel) always finishes, Coni gets one urgent notice a month and WAV one email, and she reactivates the month from Ajustes › Presupuesto by setting a new limit. The weekly engine and the nightly topic merges get ON/OFF switches with their spend visible.

**Architecture:** One migration adds `ajustes.limite_duro_usd` (null = 2 × cap) and two switches, the table `limites_del_mes` (written only by the Coni-only RPC `fijar_limite_del_mes`), the function `limite_del_mes(p_ahora)`, recreates `reservar_gasto` with `p_firmado` (the database stays the single gate: unsigned spend over the limit raises `limite_alcanzado`, signed spend always reserves), points `reservar_gasto_general` at it, and adds the notice type `limite_alcanzado`. In TypeScript the repository maps both `limite_alcanzado` and the old `tope_alcanzado` to `{ limite: true }`, signed paths call `reservarGastoFirmado`, and every path that stops calls `avisarLimite` (one notice per Santiago month, keyed `limite_alcanzado:YYYY-MM`). Coni gets the screen Ajustes › Presupuesto (bar, steppers, Reactivar, spend by provider, switches); the cap stepper leaves the main Ajustes editor, which keeps a row that links to it.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase (Postgres + RLS), Trigger.dev v4 (engine, maintenance, voice, video, carousel assembly, ingestion), Vitest (unit `pnpm test:run`, integration `pnpm test:db` against local Supabase on port 54422), Playwright + axe (`pnpm test:e2e`), Biome (`pnpm lint`; never `--unsafe`).

**Spec:** `docs/superpowers/specs/2026-11-02-conidolly-presupuesto-design.md` (board: WAV-WaAreVision/estudio-coni#14).

**Work in a worktree:** the worktree `/Users/fede/Projects/estudio-coni/.worktrees/presupuesto` on branch `feat/presupuesto` already exists with the spec commit. `cd /Users/fede/Projects/estudio-coni/.worktrees/presupuesto && pnpm install --frozen-lockfile`. Commit after each task (messages in English, ending with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` line); before each commit run `pnpm exec biome check --write <the task's files>` (safe fixes and formatting only, never `--unsafe`) and check line 1 of every edited client file is still `"use client"`. No push. Never `supabase db push`, never a Trigger or Vercel deploy inside the tasks: the release is Task 17. Local Supabase must be running (`pnpm db:start`); every migration change is applied with `pnpm db:reset` (local only).

## Decisions taken while planning (not in the spec)

- **P1. Migration name** `supabase/migrations/20261103000100_presupuesto.sql`, after `20261102000100_guia_lineas_de_ayuda.sql` (which does not touch `avisos_tipo_check`; the last full list is in `20261101000100_registro_de_datos.sql:143-147`).
- **P2. The repository shape.** The spec writes `{ limite: true, usado, limite }`, which cannot be one object. `Reserva` is `{ limite: true; usadoUsd: number | null; limiteUsd: number | null } | { limite: false; gasto }`; the figures come from the error detail, now `usado=…;estimado=…;limite=…` (the old `usado=… estimado=… tope=…` parses the same way). `resultadoDeReserva` is exported so a unit test pins both codes.
- **P3. Signed paths do not keep a dead branch.** They call `reservarGastoFirmado(db, reserva)`, which passes `firmado: true` and returns the row; if the database ever answered "limit" it throws a plain `Error` (a contract break for WAV). So `ResultadoGrabacion` loses its `"tope"` member and `textoTopeAlAcortar` disappears; the voice keeps a `"limite"` result for the unsigned voice (P4).
- **P4. Which voice is signed is decided by the piece's state, not by the function** (D1: "voice, video, carousel shortening of an approved piece"). In `lib/dominio/estados.ts` only the gate-1 signature (`aprobar_guion`) sets `puerta1` and moves a reel to `en_render`; `grabando_voz` comes only from `guion_por_aprobar` (`pedir_voz`), unsigned. `vozFirmada(fila)` in `lib/produccion/voz.ts` is `estado === "en_render" && puerta1_hash !== null`, and `asegurarVoz` reserves with `reservarGastoFirmado` only then. So the voice of the draft (`producir.ts`), «Preparar mi voz» and any new take at gate 1 (`grabar-voz.ts`) are new spend: they stop at the limit with `TEXTO_LIMITE` (the draft keeps delivering its script with `TEXTO_SIN_VOZ`, as today), and gate 1 keeps closing its voice buttons when the limit cannot cover the voice. The voice made inside the recording (`grabar.ts`, after the signature) is signed and never stops; so is the recording that the gate-1 signature starts, which is why the signature control is no longer closed by the month's limit (only by the HeyGen balance).
- **P5. Server Actions do not send the notice.** Script review, idea classification and the batch pre-check run on Vercel, where no notifier is wired (only Trigger has Resend). Coni reads `TEXTO_LIMITE` on the screen at that moment; the urgent push and the WAV email come from the first Trigger path that stops that month (script, carousel, ingestion, engine, topic jobs). Wiring Resend into Vercel is out of scope.
- **P6. One text for every stop:** `TEXTO_LIMITE` = «Llegaste a tu límite de este mes. Reactívalo en Ajustes.» It replaces `TEXTO_TOPE`, `MOTIVO_TOPE`, the two «Llegaste al tope… Súbelo en Ajustes» strings of the actions and the gate-1 line. The reclassification script says «El límite del mes no alcanza para la reclasificación. Reactívalo en Ajustes o espera al próximo mes.» Internal sentinels that Coni never reads keep their names (`TOPE`/`{ tope: true }` in `lib/ingesta`, `ResultadoMantenerTemas.tope`, `ResultadoFormacion.tope`, `ResultadoFusion.tope`, `Escritura` of the engine, `ResultadoProcesar` `"tope"`); the writers' result becomes `{ resultado: "limite" }` because their tests change anyway.
- **P7. WAV's email "only when the Coni notice was newly created"** is checked with `existeAviso(db, clave)` before `aConi`. Two runs stopping in the same second could both email WAV; accepted (one extra email, never a missed one).
- **P8. "At the limit" on the screen** = `usado + ESTIMADO_POR_GUION_USD > limite` (not even one more script fits, the same estimate the batch uses) or an unread `limite_alcanzado` notice of this month. `fijar_limite_del_mes` marks that notice read, the way `marcar_inventario_revisado` closes its notice.
- **P9. Stepper rules.** Both steppers move in steps of US$ 5 and save once after 600 ms, like today. The limit never goes under the cap (also refused by a check and by `guardarAjuste`) and tops at US$ 1.000 (twice the largest cap, `MAXIMO_DEL_LIMITE_USD`). A limit stepped back to exactly 2 × cap is stored as null, so it follows the cap again. The screen saves without «Deshacer»: the steppers are their own undo, and undoing a cap raise could not bring back the limit it reset.
- **P10. Reactivar's month row wins.** The stepper edits the default limit of every month (`limite_duro_usd`); a month Coni reactivated keeps its row, and the screen says «Este mes tu límite es US$ Z porque lo reactivaste.» `fijar_limite_del_mes` takes the same per-month advisory lock as `reservar_gasto`.
- **P11. Switches are read only when there is work.** The nightly merges read `fusiones_nocturnas_activas` after the topic deps exist (so the nightly unit test without topics stays database-free); the engine reads `motor_semanal_activo` inside `correrMotor` before it registers a run, only when `manual` is false. OFF answers `{ apagado: true }` (merges) or `{ resultado: "apagado" }` (engine): the run's output is the record, not a failure. «Proponer ahora» lives in Ingesta and passes `manual: true`.
- **P12. Colours of the bar.** The raspberry stays reserved for signing (DESIGN.md). Below 80 % of the cap the fill is ink; from 80 % the figure adds the warning icon, as the old meter did; past the cap the fill turns `bg-error`. The marks are drawn as thin ticks and listed in words under the bar («50 % del tope: US$ 20,00 · …»), so nothing overlaps on a phone and nothing is said only by position.
- **P13. `Medidor` goes away.** Its only user was the cap section of the main editor; `components/ui/medidor.tsx`, `lib/diseno/medidor.ts`, `tests/unit/medidor.test.ts` and the `Medidor` part of `tests/unit/costo.test.tsx` are removed with it.
- **P14. Fixtures that only use the old sentence as an arbitrary explanation stay** (`arranques`, `conciliar`, `disparo-fallido`, `estados`, `inicio-modelo`, `para-coni`, `textos-guion`, `detalle-para-wav`, `ui-linea-de-estado`, `pantalla-guion`, `voz-para-firmar`, `eleccion-de-ideas`, `reintentar-material`, the `guion` and `accesibilidad` e2e scenes, and Ingesta's three tests): they test how any explanation is shown, not the cap. No Ingesta task is needed: Ingesta never calls a spend RPC and only shows `motivo_fallo` as text.
- **P15. Tests that set a small cap to reach the brake keep working** because the default limit is twice a tiny cap. Tests that need the limit at an exact figure set `tope_mensual_usd` and `limite_duro_usd` to the same value in one statement, and reset both (`limite_duro_usd = null`) in the same statement, so the check `limite_no_bajo_el_tope` never trips another file's reset.
- **P16. Green task by task, full gate at the end.** Between Task 1 and Task 10 the files of a path not yet migrated may fail (they pin the old numbers); each task runs the tests of the files it touches, and Task 17 runs the whole gate. No commit leaves the tests of its own task red.

## File map

| File | Change |
|---|---|
| `supabase/migrations/20261103000100_presupuesto.sql` (new) | `ajustes` columns and check, `limites_del_mes` with RLS and audit, `limite_del_mes`, `reservar_gasto(…, p_firmado)`, `reservar_gasto_general`, `fijar_limite_del_mes`, `avisos_tipo_check` |
| `lib/supabase/database.types.ts` | regenerated (`pnpm db:types`) |
| `lib/avisos/tipos.ts` | `limite_alcanzado`: push body and route `/ajustes/presupuesto` |
| `lib/avisos/registro.ts` | `existeAviso` |
| `lib/datos/repositorio.ts` | `Reserva`, `resultadoDeReserva`, `firmado`, `reservarGastoFirmado`, `limiteDelMes` |
| `lib/presupuesto/limite.ts` (new) | `ZONA_DEL_GASTO`, `TEXTO_LIMITE`, `mesDelGasto`, `claveDelAvisoDeLimite`, `textoDelAvisoDeLimite`, `avisarLimite` |
| `lib/presupuesto/interruptores.ts` (new) | `leerInterruptores` |
| `lib/presupuesto/presentar.ts` (new) | `PROVEEDORES`, `PresupuestoDelMes`, `presentarPresupuesto`, `filaDePresupuesto`, the stepper limits |
| `lib/presupuesto/leer.ts` (new) | `leerPresupuestoDelMes` |
| `lib/produccion/comun.ts` | `TEXTO_TOPE` and `avisarTope` removed |
| `lib/produccion/producir.ts`, `carrusel.ts` | stop at the limit with `avisarLimite` |
| `lib/produccion/voz.ts`, `grabar-voz.ts` | `vozFirmada`: a voice before gate 1 stops at the limit, after it reserves signed |
| `lib/produccion/grabar.ts`, `armar-carrusel.ts` | signed: `reservarGastoFirmado`, no limit branch |
| `lib/acciones/guion.ts`, `ideas.ts`, `piezas.ts`, `lib/dominio/lote.ts`, `lib/pilares/proponer.ts` | the limit in the actions and the batch |
| `lib/datos/pantallas.ts`, `lib/datos/grabacion.ts` | `Presupuesto.limite`; cost line and gate-1 voice buttons against the limit; the signature never closed by it |
| `lib/ingesta/procesar.ts`, `lib/ingesta/gasto-material.ts` | ingestion: `TEXTO_LIMITE`, `avisarLimite` |
| `lib/motor/semanal.ts`, `lib/mantenimiento/ejecutar.ts`, `lib/produccion/deps-reales.ts` | engine and topic jobs: switches and notices |
| `lib/acciones/ajustes.ts`, `lib/acciones/presupuesto.ts` (new), `app/(app)/ajustes/acciones.ts` | limit, switches, cap reset, Reactivar |
| `app/(app)/ajustes/presupuesto/page.tsx`, `pantalla-de-presupuesto.tsx` (new) | the screen |
| `app/(app)/ajustes/tu-presupuesto.tsx` (new), `page.tsx`, `editor-de-ajustes.tsx` | the row; the cap leaves the editor |
| `components/ui/medidor.tsx`, `lib/diseno/medidor.ts` | deleted |
| tests | listed in each task |
| `docs/TRASPASO.md` | one bullet |

---
### Task 1: Schema: the hard limit, the month's limit, the switches and the notice

**Files:**
- Create: `supabase/migrations/20261103000100_presupuesto.sql`, `tests/integration/presupuesto-esquema.test.ts`
- Modify: `lib/avisos/tipos.ts`, `lib/supabase/database.types.ts` (regenerated), `tests/integration/gastos.test.ts`, `tests/unit/avisos.test.ts`

- [ ] **Step 1: Write the failing unit test** (append to `tests/unit/avisos.test.ts`; `esTipoDeAviso`, `mensajePush` and `rutaDeAviso` are already imported)

```ts
describe("aviso del límite del mes", () => {
  it("opens Ajustes, Presupuesto and says it in the push without the amount", () => {
    const aviso = { tipo: "limite_alcanzado" } as const
    expect(esTipoDeAviso("limite_alcanzado")).toBe(true)
    expect(rutaDeAviso(aviso)).toBe("/ajustes/presupuesto")
    expect(mensajePush(aviso)).toMatchObject({
      cuerpo: "Llegaste a tu límite de gasto de este mes",
      url: "/ajustes/presupuesto",
    })
  })
})
```

- [ ] **Step 2: Write the failing schema test** (`tests/integration/presupuesto-esquema.test.ts`)

```ts
import type pg from "pg"
import { afterAll, describe, expect, it } from "vitest"
import { TIPOS_DE_AVISO } from "@/lib/avisos/tipos"
import { asumir, CONI, como, comoConi, comoMantenedor, comoOtra, comoPostgres, comoServicio, fallaCon, pool } from "./db"

afterAll(() => pool.end())

const MES_DE_HOY = "date_trunc('month', now() at time zone 'America/Santiago')::date"

async function gastar(c: pg.PoolClient, clave: string, monto: number, ahora = "now()"): Promise<void> {
  await c.query(`select public.reservar_gasto(null, 'heygen', 'grabar', $1, $2, ${ahora})`, [monto, clave])
}

async function limiteDelMes(c: pg.PoolClient, ahora = "now()"): Promise<number | undefined> {
  const { rows } = await c.query<{ limite: number }>(`select public.limite_del_mes(${ahora})::float8 as limite`)
  return rows[0]?.limite
}

describe("ajustes del presupuesto", () => {
  it("starts with no limit of her own and both self-running switches on", async () => {
    const { rows } = await pool.query(
      "select limite_duro_usd, motor_semanal_activo, fusiones_nocturnas_activas from public.ajustes",
    )
    expect(rows[0]).toEqual({ limite_duro_usd: null, motor_semanal_activo: true, fusiones_nocturnas_activas: true })
  })

  it("never lets the limit go under the cap", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(c, "update public.ajustes set limite_duro_usd = 30")
      expect(error.code).toBe("23514")
      expect(error.message).toMatch(/limite_no_bajo_el_tope/)
    })
  })
})

describe("limite_del_mes", () => {
  it("is twice the cap when Coni set no limit", async () => {
    await como(comoServicio, async (c) => {
      expect(await limiteDelMes(c)).toBe(80)
    })
  })

  it("is the limit Coni set in Ajustes, and she can read it", async () => {
    await como(comoConi, async (c) => {
      await c.query("update public.ajustes set limite_duro_usd = 100")
      expect(await limiteDelMes(c)).toBe(100)
    })
  })

  it("is this month's row when she reactivated, over her limit", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("update public.ajustes set limite_duro_usd = 100")
      await c.query(`insert into public.limites_del_mes (mes, limite_usd, fijado_por) values (${MES_DE_HOY}, 130, $1)`, [
        CONI,
      ])
      expect(await limiteDelMes(c)).toBe(130)
    })
  })

  it("reads the month in Santiago when UTC is already in the next one", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("insert into public.limites_del_mes (mes, limite_usd, fijado_por) values ('2026-10-01', 15, $1)", [
        CONI,
      ])
      expect(await limiteDelMes(c, "'2026-11-01T02:00:00Z'")).toBe(15)
      expect(await limiteDelMes(c, "'2026-11-01T03:00:00Z'")).toBe(80)
    })
  })
})

describe("reservar_gasto con el límite", () => {
  it("lets signed spend through over the limit and refuses new spend there", async () => {
    await como(comoServicio, async (c) => {
      await gastar(c, "firmado-base", 79)
      const { rows } = await c.query<{ estado: string }>(
        "select estado from public.reservar_gasto(null, 'heygen', 'grabar', 10, 'firmado-1', now(), false, null, true)",
      )
      expect(rows[0]?.estado).toBe("reservado")

      const error = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 1, 'nuevo-1')")
      expect(error.code).toBe("P0001")
      expect(error.message).toBe("limite_alcanzado")
      expect(error.detail).toContain("usado=89")
      expect(error.detail).toContain(";limite=80")
    })
  })

  it("uses this month's row instead of twice the cap", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(`insert into public.limites_del_mes (mes, limite_usd, fijado_por) values (${MES_DE_HOY}, 130, $1)`, [
        CONI,
      ])
      await asumir(c, comoServicio)
      await gastar(c, "fila-del-mes", 120)
      const error = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 11, 'fila-del-mes-2')")
      expect(error.message).toBe("limite_alcanzado")
    })
  })

  it("checks the limit of the Santiago month at the boundary", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("insert into public.limites_del_mes (mes, limite_usd, fijado_por) values ('2026-10-01', 15, $1)", [
        CONI,
      ])
      await asumir(c, comoServicio)
      const octubre = await fallaCon(
        c,
        "select public.reservar_gasto(null, 'heygen', 'grabar', 20, 'borde-1', '2026-11-01T02:00:00Z')",
      )
      expect(octubre.message).toBe("limite_alcanzado")
      await gastar(c, "borde-2", 20, "'2026-11-01T03:00:00Z'")
    })
  })

  it("counts a spend without a piece against the limit too, never as signed", async () => {
    await como(comoServicio, async (c) => {
      await gastar(c, "general-base", 79.95)
      const error = await fallaCon(
        c,
        "select public.reservar_gasto_general('anthropic', 'idea_propia', 0.1, 'general-1', now())",
      )
      expect(error.message).toBe("limite_alcanzado")
    })
  })
})

describe("fijar_limite_del_mes", () => {
  it("lets Coni set this month's limit, replaces it on a second call and closes the month's limit notice", async () => {
    await como(comoPostgres, async (c) => {
      const { rows: claves } = await c.query<{ clave: string }>(
        `select 'limite_alcanzado:' || to_char(${MES_DE_HOY}, 'YYYY-MM') as clave`,
      )
      const clave = claves[0]?.clave
      await c.query(
        "insert into public.avisos (tipo, clave, mensaje) values ('limite_alcanzado', $1, 'Llegaste a tu límite.')",
        [clave],
      )

      await asumir(c, comoConi)
      const { rows } = await c.query<{ limite: number; fijado_por: string }>(
        "select limite_usd::float8 as limite, fijado_por::text as fijado_por from public.fijar_limite_del_mes(120)",
      )
      expect(rows[0]).toEqual({ limite: 120, fijado_por: CONI })
      await c.query("select public.fijar_limite_del_mes(150)")

      await asumir(c, comoPostgres)
      const { rows: filas } = await c.query<{ limite: number }>(
        `select limite_usd::float8 as limite from public.limites_del_mes where mes = ${MES_DE_HOY}`,
      )
      expect(filas).toEqual([{ limite: 150 }])
      const aviso = await c.query<{ leido_en: Date | null }>("select leido_en from public.avisos where clave = $1", [
        clave,
      ])
      expect(aviso.rows[0]?.leido_en).toBeInstanceOf(Date)
    })
  })

  it("refuses a limit that does not cover what the month already used, and says how much", async () => {
    await como(comoServicio, async (c) => {
      await gastar(c, "fijar-usado", 50)
      await asumir(c, comoConi)
      const error = await fallaCon(c, "select public.fijar_limite_del_mes(50)")
      expect(error.code).toBe("22023")
      expect(error.message).toBe("limite_bajo")
      expect(error.detail).toContain("usado=50")
    })
  })

  it("is Coni's alone", async () => {
    for (const sesion of [comoMantenedor, comoOtra]) {
      await como(sesion, async (c) => {
        const error = await fallaCon(c, "select public.fijar_limite_del_mes(120)")
        expect(error.code).toBe("42501")
        expect(error.message).toBe("solo_coni")
      })
    }
  })
})

describe("limites_del_mes", () => {
  it("lets Coni and WAV read it and hides it from anybody else", async () => {
    await como(comoPostgres, async (c) => {
      await c.query(`insert into public.limites_del_mes (mes, limite_usd, fijado_por) values (${MES_DE_HOY}, 130, $1)`, [
        CONI,
      ])
      for (const [sesion, filas] of [
        [comoConi, 1],
        [comoMantenedor, 1],
        [comoOtra, 0],
      ] as const) {
        await asumir(c, sesion)
        expect((await c.query("select 1 from public.limites_del_mes")).rowCount).toBe(filas)
      }
    })
  })

  it("is written only through fijar_limite_del_mes", async () => {
    await como(comoConi, async (c) => {
      const error = await fallaCon(
        c,
        `insert into public.limites_del_mes (mes, limite_usd, fijado_por) values (${MES_DE_HOY}, 130, $1)`,
        [CONI],
      )
      expect(error.message).toMatch(/permission denied/)
    })
  })
})

describe("avisos_tipo_check", () => {
  it("accepts exactly the notice types the app knows, the limit included", async () => {
    const { rows } = await pool.query<{ def: string }>(
      "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'avisos_tipo_check'",
    )
    const tipos = [...(rows[0]?.def ?? "").matchAll(/'([a-z0-9_]+)'::text/g)].map((m) => m[1])
    expect(tipos).toContain("limite_alcanzado")
    expect(tipos).toContain("tope_alcanzado")
    expect([...tipos].sort()).toEqual([...TIPOS_DE_AVISO].sort())
  })
})
```

- [ ] **Step 3: Move the existing reservation tests to the new rule** in `tests/integration/gastos.test.ts`. Replace the whole `describe("reservar gasto", () => { … })` block (from `describe("reservar gasto", () => {` down to the `})` right before `describe("reservas simultáneas"`) with:

```ts
describe("reservar gasto", () => {
  it("reserva cuando cabe en el límite del mes", async () => {
    await como(comoServicio, async (c) => {
      const reserva = await reservar(c, "clave-1", 10)
      const { rows } = await c.query<{ mes: string }>(
        "select date_trunc('month', now() at time zone 'America/Santiago')::date::text as mes",
      )
      expect(reserva).toMatchObject({ clave: "clave-1", estado: "reservado", estimado: 10, real: null })
      expect(reserva.mes).toBe(rows[0]?.mes)
    })
  })

  it("sigue reservando sobre el tope, porque el tope ya no frena", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-1", 35)
      expect((await reservar(c, "clave-2", 10)).estado).toBe("reservado")
    })
  })

  it("reserva cuando la suma queda justo en el límite", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-1", 70)
      expect((await reservar(c, "clave-2", 10)).estado).toBe("reservado")
    })
  })

  it("rechaza lo nuevo cuando la reserva pasa el límite, el doble del tope", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-1", 75)
      const err = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 10, 'clave-2')")
      expect(err.code).toBe("P0001")
      expect(err.message).toBe("limite_alcanzado")
      expect(err.detail).toContain("usado=75")
      expect(err.detail).toContain(";limite=80")
    })
  })

  it("mueve el límite con el tope cuando coni lo cambia en los ajustes", async () => {
    await como(comoConi, async (c) => {
      await c.query("update public.ajustes set tope_mensual_usd = 12")
      await asumir(c, comoServicio)
      await reservar(c, "clave-1", 20)
      const err = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 5, 'clave-2')")
      expect(err.message).toBe("limite_alcanzado")
    })
  })

  it("rechaza cuando faltan los ajustes en vez de gastar sin límite", async () => {
    await como(comoPostgres, async (c) => {
      await c.query("delete from public.ajustes")
      await asumir(c, comoServicio)
      const err = await fallaCon(c, unaReserva)
      expect(err.code).toBe("P0001")
      expect(err.message).toBe("ajustes_faltantes")
    })
  })

  it("cuenta lo confirmado por su monto real y no cuenta lo liberado", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "a", 20)
      const confirmada = await c.query<Reserva>(`select ${COLUMNAS} from public.confirmar_gasto('a', 5)`)
      expect(confirmada.rows[0]).toMatchObject({ estado: "confirmado", real: 5 })

      await reservar(c, "b", 30)
      const liberada = await c.query<Reserva>(`select ${COLUMNAS} from public.liberar_gasto('b')`)
      expect(liberada.rows[0]).toMatchObject({ estado: "liberado" })

      // 5 confirmed (not the 20 estimated) + 75 = 80: fits only if the released 30 is ignored.
      expect((await reservar(c, "c", 75)).estado).toBe("reservado")
      const err = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 1, 'd')")
      expect(err.message).toBe("limite_alcanzado")
    })
  })

  it("no cambia nada cuando confirma o libera una reserva que ya no está reservada", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "a", 10)
      await c.query("select public.liberar_gasto('a')")
      const { rowCount } = await c.query("select * from public.confirmar_gasto('a', 3) where id is not null")
      expect(rowCount).toBe(0)
    })
  })

  it("devuelve la misma reserva cuando se repite la clave", async () => {
    await como(comoServicio, async (c) => {
      const primera = await reservar(c, "repetida", 50)
      const segunda = await reservar(c, "repetida", 50)
      expect(segunda.id).toBe(primera.id)
      const { rows } = await c.query<{ n: string }>(
        "select count(*)::text as n from public.gastos where clave = 'repetida'",
      )
      expect(rows[0]?.n).toBe("1")
      // The repeat did not consume the limit a second time.
      expect((await reservar(c, "otra", 30)).estado).toBe("reservado")
    })
  })

  it("usa el mes de santiago cuando en utc ya empezó noviembre", async () => {
    await como(comoServicio, async (c) => {
      const reserva = await reservar(c, "limite-1", 10, "2026-11-01T02:00:00Z")
      expect(reserva.mes).toBe("2026-10-01")
    })
  })

  it("cambia de mes cuando en santiago ya es primero de noviembre", async () => {
    await como(comoServicio, async (c) => {
      const reserva = await reservar(c, "limite-2", 10, "2026-11-01T03:00:00Z")
      expect(reserva.mes).toBe("2026-11-01")
    })
  })

  it("separa el límite de cada mes cuando se reserva en otro mes", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "octubre", 80, "2026-10-15T12:00:00Z")
      const noviembre = await reservar(c, "noviembre", 80, "2026-11-15T12:00:00Z")
      expect(noviembre.estado).toBe("reservado")
    })
  })

  it("cuenta contra el límite del mes cuando el proveedor es voyage, reservado y confirmado", async () => {
    await como(comoServicio, async (c) => {
      await c.query("select public.reservar_gasto_general('voyage', 'embeddings', 75, 'voyage-1', now())")
      const err = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 10, 'clave-2')")
      expect(err.code).toBe("P0001")
      await c.query("select public.confirmar_gasto('voyage-1', 70)")
      const { rows } = await c.query<{ estado: string; real: number }>(
        "select estado, real_usd::float8 as real from public.gastos where clave = 'voyage-1'",
      )
      expect(rows[0]).toEqual({ estado: "confirmado", real: 70 })
      await c.query("select public.reservar_gasto(null, 'heygen', 'grabar', 10, 'clave-3')")
      const falla = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 1, 'clave-4')")
      expect(falla.code).toBe("P0001")
    })
  })

  it("rechaza un monto que no es positivo", async () => {
    await como(comoServicio, async (c) => {
      const err = await fallaCon(c, "select public.reservar_gasto(null, 'heygen', 'grabar', 0, 'cero')")
      expect(err.code).toBe("23514")
    })
  })
})
```

In `describe("reservas simultáneas")`, change the amount `25` in `reservarYSoltar` to `45`, the test name to `"deja pasar solo una de dos reservas simultáneas que juntas pasan el límite"`, and `{ message: "tope_alcanzado" }` to `{ message: "limite_alcanzado" }`. In `describe("reabrir una reserva liberada")` replace the test `"checks the cap again before reopening"` with:

```ts
  it("checks the limit again before reopening", async () => {
    await como(comoServicio, async (c) => {
      await reservar(c, "clave-tope", 1)
      await c.query("select public.liberar_gasto('clave-tope', true)")
      await reservar(c, "clave-llena", 79.5)
      const err = await fallaCon(
        c,
        "select public.reservar_gasto(null, 'elevenlabs', 'voz', 1, 'clave-tope', now(), true)",
      )
      expect(err.message).toBe("limite_alcanzado")
    })
  })
```

- [ ] **Step 4: Run both, expect FAIL** (no `limite_alcanzado` type, no columns, no functions; the moved tests still see the old cap)

Run: `pnpm test:run tests/unit/avisos.test.ts -t "límite del mes"` and `pnpm test:db tests/integration/presupuesto-esquema.test.ts tests/integration/gastos.test.ts`

- [ ] **Step 5: Implement the notice type** in `lib/avisos/tipos.ts`. Add `"limite_alcanzado",` as the last item of `TIPOS_DE_AVISO`, add to `CUERPO_DE_PUSH`:

```ts
  limite_alcanzado: "Llegaste a tu límite de gasto de este mes",
```

and replace `rutaDeAviso` with:

```ts
/**
 * Where tapping a notice leads: the piece it is about, the register for the yearly review, the budget for the month's
 * limit, or Inicio. Never an approve action.
 */
export function rutaDeAviso(aviso: { tipo: TipoDeAviso; piezaId?: string | null }): string {
  if (aviso.tipo === "revision_de_inventario") return "/ajustes/datos-personales"
  if (aviso.tipo === "limite_alcanzado") return "/ajustes/presupuesto"
  if (!aviso.piezaId) return "/"
  return aviso.tipo === "guion_listo" ? `/guion/${aviso.piezaId}` : `/video/${aviso.piezaId}`
}
```

`tope_alcanzado` stays in the list: old notices keep it.

- [ ] **Step 6: Write the migration** (`supabase/migrations/20261103000100_presupuesto.sql`)

```sql
-- Budget panel and hard limit (spec 2026-11-02, change 12a of Coni's request, her decision A1). The monthly cap becomes
-- a reference with alarms in the panel; the hard limit (twice the cap unless Coni sets one) is the only brake. The
-- database stays the single gate (D6): reservar_gasto refuses unsigned spend over the limit, under the same per-month
-- lock as before, and always reserves signed work (D1).

alter table public.ajustes
  -- Null means twice the cap, so a new cap moves the default limit with it (D5).
  add column limite_duro_usd numeric(10, 2),
  -- What spends by itself today stays on, with a switch in Ajustes › Presupuesto (D2).
  add column motor_semanal_activo boolean not null default true,
  add column fusiones_nocturnas_activas boolean not null default true,
  add constraint limite_no_bajo_el_tope check (limite_duro_usd is null or limite_duro_usd >= tope_mensual_usd);

-- «Reactivar» (D4): the limit Coni set for one month. Written only through fijar_limite_del_mes().
create table public.limites_del_mes (
  mes date primary key check (mes = date_trunc('month', mes)::date),
  limite_usd numeric(10, 2) not null check (limite_usd > 0),
  fijado_por uuid not null,
  fijado_en timestamptz not null default now()
);

alter table public.limites_del_mes enable row level security;
create policy "coni y wav leen los limites del mes" on public.limites_del_mes for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
revoke all on public.limites_del_mes from anon;
revoke insert, update, delete, truncate on public.limites_del_mes from authenticated;
grant select on public.limites_del_mes to authenticated;
create trigger auditar after insert or update or delete on public.limites_del_mes
  for each row execute function public.registrar_evento();

-- The brake of the Santiago month of p_ahora: the month's row, else her limit, else twice the cap. Null only without
-- the settings row (reservar_gasto raises ajustes_faltantes first).
create function public.limite_del_mes(p_ahora timestamptz default now()) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(
    (select l.limite_usd from public.limites_del_mes l
      where l.mes = date_trunc('month', p_ahora at time zone 'America/Santiago')::date),
    (select coalesce(a.limite_duro_usd, 2 * a.tope_mensual_usd) from public.ajustes a where a.id)
  )
$$;

revoke execute on function public.limite_del_mes(timestamptz) from public, anon;
grant execute on function public.limite_del_mes(timestamptz) to authenticated, service_role;

drop function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz, boolean, uuid);

create function public.reservar_gasto(
  p_pieza uuid,
  p_proveedor text,
  p_paso text,
  p_estimado numeric,
  p_clave text,
  p_ahora timestamptz default now(),
  p_reabrir boolean default false,
  p_reservado_por uuid default null,
  -- Work already past gate 1 (voice, video, the shortening of a signed carousel): never stopped by the limit (D1).
  p_firmado boolean default false
) returns public.gastos
language plpgsql set search_path = '' as $$
declare
  v_mes date := date_trunc('month', p_ahora at time zone 'America/Santiago')::date;
  v_existente public.gastos;
  v_limite numeric;
  v_usado numeric;
  v_nuevo public.gastos;
begin
  -- One reservation at a time per month, so two runs started together cannot both pass the limit.
  perform pg_advisory_xact_lock(hashtext('gastos:' || v_mes::text));

  select * into v_existente from public.gastos where clave = p_clave;
  if found and not (p_reabrir and v_existente.estado = 'liberado' and v_existente.sin_cobro) then
    return v_existente;
  end if;

  -- Without the settings row there is no limit to compare with, and spend would pass unchecked.
  if not exists (select 1 from public.ajustes where id) then
    raise exception using errcode = 'P0001', message = 'ajustes_faltantes';
  end if;
  v_limite := public.limite_del_mes(p_ahora);
  select coalesce(sum(coalesce(real_usd, estimado_usd)), 0) into v_usado
    from public.gastos where mes = v_mes and estado in ('reservado', 'confirmado');
  if not p_firmado and v_usado + p_estimado > v_limite then
    raise exception using errcode = 'P0001', message = 'limite_alcanzado',
      detail = format('usado=%s;estimado=%s;limite=%s', v_usado, p_estimado, v_limite);
  end if;

  if v_existente.id is not null then
    -- Reopened: counted again in this month, with a fresh clock for the sweeper and no proof of "not charged".
    update public.gastos
       set estado = 'reservado', estimado_usd = p_estimado, real_usd = null, mes = v_mes,
           creado_en = now(), sin_cobro = false, reservado_por = p_reservado_por
     where id = v_existente.id
    returning * into v_nuevo;
  else
    insert into public.gastos (pieza_id, proveedor, paso, mes, estimado_usd, clave, reservado_por)
    values (p_pieza, p_proveedor, p_paso, v_mes, p_estimado, p_clave, p_reservado_por)
    returning * into v_nuevo;
  end if;
  return v_nuevo;
end $$;

revoke execute on function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz, boolean, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.reservar_gasto(uuid, text, text, numeric, text, timestamptz, boolean, uuid, boolean)
  to service_role;

-- A spend without a piece (her own idea classified, ingestion, the engine, the topic jobs) is never signed work.
create or replace function public.reservar_gasto_general(
  p_proveedor text,
  p_paso text,
  p_estimado numeric,
  p_clave text,
  p_ahora timestamptz default now()
) returns public.gastos
language sql set search_path = '' as $$
  select * from public.reservar_gasto(null, p_proveedor, p_paso, p_estimado, p_clave, p_ahora, false, null, false)
$$;

-- «Reactivar»: Coni sets this month's limit. It must cover what the month already used, read under the month's lock so
-- a reservation cannot slip in between. Her limit notice of the month has done its job once she reactivated.
create function public.fijar_limite_del_mes(p_limite numeric) returns public.limites_del_mes
language plpgsql security definer set search_path = '' as $$
declare
  v_mes date := date_trunc('month', now() at time zone 'America/Santiago')::date;
  v_usado numeric;
  v_fila public.limites_del_mes;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni';
  end if;
  perform pg_advisory_xact_lock(hashtext('gastos:' || v_mes::text));
  select coalesce(sum(coalesce(real_usd, estimado_usd)), 0) into v_usado
    from public.gastos where mes = v_mes and estado in ('reservado', 'confirmado');
  if p_limite is null or p_limite <= v_usado then
    raise exception using errcode = '22023', message = 'limite_bajo', detail = format('usado=%s', v_usado);
  end if;
  insert into public.limites_del_mes (mes, limite_usd, fijado_por) values (v_mes, p_limite, auth.uid())
  on conflict (mes) do update
    set limite_usd = excluded.limite_usd, fijado_por = excluded.fijado_por, fijado_en = now()
  returning * into v_fila;
  update public.avisos set leido_en = now()
   where clave = 'limite_alcanzado:' || to_char(v_mes, 'YYYY-MM') and leido_en is null;
  return v_fila;
end $$;

revoke execute on function public.fijar_limite_del_mes(numeric) from public, anon;
grant execute on function public.fijar_limite_del_mes(numeric) to authenticated;

-- `limite_alcanzado`: the month's hard limit. `tope_alcanzado` stays for the notices already stored. The full list
-- (20261101000100_registro_de_datos.sql plus this type); tests/integration/presupuesto-esquema.test.ts checks it equals
-- TIPOS_DE_AVISO.
alter table public.avisos drop constraint avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check check (tipo in (
  'ideas_propuestas', 'guion_listo', 'video_listo', 'error_definitivo', 'publicado', 'tope_alcanzado',
  'instagram_por_vencer', 'recordatorio_48h', 'listo_para_subir', 'linkedin_por_vencer', 'revision_de_inventario',
  'limite_alcanzado'
));
```

- [ ] **Step 7: Apply, regenerate the types and run, expect PASS**

Run: `pnpm db:reset && pnpm db:types`, then `pnpm test:db tests/integration/presupuesto-esquema.test.ts tests/integration/gastos.test.ts tests/integration/datos-personales-esquema.test.ts tests/integration/acceso.test.ts tests/integration/auditoria.test.ts`, `pnpm test:run tests/unit/avisos.test.ts` and `pnpm type`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261103000100_presupuesto.sql lib/supabase/database.types.ts lib/avisos/tipos.ts tests/unit/avisos.test.ts tests/integration/presupuesto-esquema.test.ts tests/integration/gastos.test.ts
git commit -m "Add the hard limit, the month's limit and the budget switches to the schema" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The repository reads both stop codes, and signed work reserves

**Files:**
- Modify: `lib/datos/repositorio.ts`, and the one-word rename `reserva.tope` → `reserva.limite` in `lib/produccion/producir.ts`, `lib/produccion/carrusel.ts`, `lib/produccion/armar-carrusel.ts`, `lib/produccion/voz.ts`, `lib/produccion/grabar.ts`, `lib/acciones/guion.ts`, `lib/acciones/ideas.ts`, `lib/pilares/proponer.ts`, `lib/ingesta/gasto-material.ts`
- Test: `tests/unit/reserva.test.ts` (new), `tests/integration/reserva-de-gasto.test.ts` (new)

- [ ] **Step 1: Write the failing unit test** (`tests/unit/reserva.test.ts`)

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { type FilaDeGasto, resultadoDeReserva } from "@/lib/datos/repositorio"
import { FallaDeConfiguracion } from "@/lib/dominio/falla"

const GASTO: FilaDeGasto = {
  id: 1,
  pieza_id: null,
  proveedor: "anthropic",
  paso: "guion",
  mes: "2026-11-01",
  estimado_usd: 0.5,
  real_usd: null,
  estado: "reservado",
  clave: "clave-1",
  creado_en: "2026-11-02T12:00:00Z",
  sin_cobro: false,
  reservado_por: null,
}

describe("resultadoDeReserva", () => {
  it("reads the hard limit with what the month used and the limit", () => {
    expect(
      resultadoDeReserva({ message: "limite_alcanzado", details: "usado=79.5000;estimado=0.5;limite=80.00" }, null),
    ).toEqual({ limite: true, usadoUsd: 79.5, limiteUsd: 80 })
  })

  it("reads the old cap error the same way, so the deploy window never breaks a run", () => {
    expect(
      resultadoDeReserva({ message: "tope_alcanzado", details: "usado=35.0000 estimado=10 tope=40.00" }, null),
    ).toEqual({ limite: true, usadoUsd: 35, limiteUsd: 40 })
  })

  it("still stops when the detail is missing", () => {
    expect(resultadoDeReserva({ message: "limite_alcanzado" }, null)).toEqual({
      limite: true,
      usadoUsd: null,
      limiteUsd: null,
    })
  })

  it("fails as a configuration error without the settings row", () => {
    expect(() => resultadoDeReserva({ message: "ajustes_faltantes" }, null)).toThrow(FallaDeConfiguracion)
  })

  it("hands back the reserved row", () => {
    expect(resultadoDeReserva(null, GASTO)).toEqual({ limite: false, gasto: GASTO })
  })
})
```

- [ ] **Step 2: Write the failing integration test** (`tests/integration/reserva-de-gasto.test.ts`)

```ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { limiteDelMes, reservarGasto, reservarGastoFirmado } from "@/lib/datos/repositorio"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"
import { borrarSembrado, sembrarPieza } from "./siembra"

const db = clienteDeServicio()
const AHORA = new Date().toISOString()
const piezas: string[] = []
let piezaId = ""

async function gastado(usd: number): Promise<void> {
  await pool.query(
    "insert into public.gastos (proveedor, paso, mes, estimado_usd, real_usd, estado, clave) values ('heygen', 'prueba_reserva', date_trunc('month', now() at time zone 'America/Santiago')::date, $1, $1, 'confirmado', 'prueba-reserva-base')",
    [usd],
  )
}

const pedido = (clave: string) => ({
  piezaId,
  proveedor: "anthropic" as const,
  paso: "prueba_reserva",
  estimadoUsd: 0.5,
  clave,
  ahora: AHORA,
})

beforeAll(async () => {
  piezaId = await sembrarPieza("guion_por_aprobar")
  piezas.push(piezaId)
})
afterEach(() => pool.query("delete from public.gastos where paso = 'prueba_reserva'"))
afterAll(async () => {
  await borrarSembrado(piezas, [])
  await pool.end()
})

describe("reservarGasto y el límite", () => {
  it("says the limit stopped new spend, with the month's figures", async () => {
    await gastado(79.8)
    expect(await reservarGasto(db, pedido("prueba-reserva-1"))).toEqual({
      limite: true,
      usadoUsd: 79.8,
      limiteUsd: 80,
    })
  })

  it("reserves signed work over the limit", async () => {
    await gastado(79.8)
    const gasto = await reservarGastoFirmado(db, pedido("prueba-reserva-2"))
    expect(gasto).toMatchObject({ clave: "prueba-reserva-2", estado: "reservado" })
  })

  it("reads this month's limit", async () => {
    expect(await limiteDelMes(db, AHORA)).toBe(80)
  })
})
```

- [ ] **Step 3: Run both, expect FAIL** — `pnpm test:run tests/unit/reserva.test.ts` and `pnpm test:db tests/integration/reserva-de-gasto.test.ts` (no `resultadoDeReserva` export, no `reservarGastoFirmado`, no `limiteDelMes`).

- [ ] **Step 4: Implement** in `lib/datos/repositorio.ts`. Replace everything from `export type Reserva` down to the end of `reservarGastoGeneral` with:

```ts
/**
 * What a reservation answers. `limite` is the hard limit of the month stopping new spend (spec 2026-11-02): the figures
 * come from the error's detail and are null if it is missing.
 */
export type Reserva =
  | { limite: true; usadoUsd: number | null; limiteUsd: number | null }
  | { limite: false; gasto: FilaDeGasto }

/**
 * The errors of `reservar_gasto` are its contract (supabase/migrations/20261103000100_presupuesto.sql). `tope_alcanzado`
 * is what the function raised before the hard limit: it is read the same way, so this code and the old function
 * survive the deploy window together.
 */
const ERRORES_DE_LIMITE = new Set(["limite_alcanzado", "tope_alcanzado"])
const ERROR_SIN_AJUSTES = "ajustes_faltantes"

function cifraDe(detalle: string | null | undefined, patron: RegExp): number | null {
  const encontrada = detalle ? patron.exec(detalle) : null
  return encontrada?.[1] === undefined ? null : Number(encontrada[1])
}

export function resultadoDeReserva(
  error: { message: string; details?: string | null } | null,
  gasto: FilaDeGasto | null,
): Reserva {
  if (error) {
    if (ERRORES_DE_LIMITE.has(error.message)) {
      return {
        limite: true,
        usadoUsd: cifraDe(error.details, /usado=([0-9.]+)/),
        limiteUsd: cifraDe(error.details, /(?:limite|tope)=([0-9.]+)/),
      }
    }
    // Without the settings row there is no limit to check, and retrying will not create it.
    if (error.message === ERROR_SIN_AJUSTES) {
      throw new FallaDeConfiguracion("Falta la fila de ajustes: sin ella no hay límite de gasto que revisar.")
    }
    throw fallo("No pude reservar el gasto", error)
  }
  if (!gasto) throw new Error("La base no devolvió el gasto reservado.")
  return { limite: false, gasto }
}

export interface PedidoDeReserva {
  piezaId: string
  proveedor: "heygen" | "elevenlabs" | "anthropic"
  paso: string
  estimadoUsd: number
  clave: string
  ahora: string
  /** Reopen a released key (only the voice, whose release means "refused, not charged"). */
  reabrir?: boolean
  /** The caller's token: the reservation it gets back is its own only when `reservado_por` matches. */
  reservadoPor?: string
  /** Work already past gate 1: the limit never stops it (D1). Prefer `reservarGastoFirmado`. */
  firmado?: boolean
}

export async function reservarGasto(db: Db, reserva: PedidoDeReserva): Promise<Reserva> {
  const { data, error } = await db.rpc("reservar_gasto", {
    p_pieza: reserva.piezaId,
    p_proveedor: reserva.proveedor,
    p_paso: reserva.paso,
    p_estimado: reserva.estimadoUsd,
    p_clave: reserva.clave,
    p_ahora: reserva.ahora,
    p_reabrir: reserva.reabrir ?? false,
    p_reservado_por: reserva.reservadoPor,
    p_firmado: reserva.firmado ?? false,
  })
  return resultadoDeReserva(error, data)
}

/**
 * Signed work (voice, video, the shortening of a signed carousel): the database always reserves it, so the caller gets
 * the row. An answer of "limit" would break the function's contract, and is WAV's to look at.
 */
export async function reservarGastoFirmado(db: Db, reserva: Omit<PedidoDeReserva, "firmado">): Promise<FilaDeGasto> {
  const resultado = await reservarGasto(db, { ...reserva, firmado: true })
  if (resultado.limite) throw new Error("reservar_gasto frenó un gasto firmado, y su contrato dice que nunca lo hace.")
  return resultado.gasto
}

/** A spend that belongs to no piece (`reservar_gasto_general`); it counts against the month's limit all the same. */
export async function reservarGastoGeneral(
  db: Db,
  reserva: {
    proveedor: "heygen" | "elevenlabs" | "anthropic" | "voyage"
    paso: string
    estimadoUsd: number
    clave: string
    ahora: string
  },
): Promise<Reserva> {
  const { data, error } = await db.rpc("reservar_gasto_general", {
    p_proveedor: reserva.proveedor,
    p_paso: reserva.paso,
    p_estimado: reserva.estimadoUsd,
    p_clave: reserva.clave,
    p_ahora: reserva.ahora,
  })
  return resultadoDeReserva(error, data)
}

/** The brake of the Santiago month of `ahora` (`limite_del_mes`): this month's row, her limit, or twice the cap. */
export async function limiteDelMes(db: Db, ahora: string): Promise<number> {
  const { data, error } = await db.rpc("limite_del_mes", { p_ahora: ahora })
  if (error) throw fallo("No pude leer el límite del mes", error)
  if (data === null) throw new FallaDeConfiguracion("Falta la fila de ajustes: sin ella no hay límite de gasto.")
  return Number(data)
}
```

Then rename the discriminant at its nine readers, one word each (`.tope` → `.limite`), nothing else:

| File | Line today | Becomes |
|---|---|---|
| `lib/produccion/producir.ts` | `if (reservaClaude.tope) {` | `if (reservaClaude.limite) {` |
| `lib/produccion/carrusel.ts` | `if (reserva.tope) {` | `if (reserva.limite) {` |
| `lib/produccion/armar-carrusel.ts` | `if (reserva.tope) {` | `if (reserva.limite) {` |
| `lib/produccion/voz.ts` | `if (reserva.tope) return { tipo: "tope" }` | `if (reserva.limite) return { tipo: "tope" }` |
| `lib/produccion/grabar.ts` | `if (reserva.tope) {` | `if (reserva.limite) {` |
| `lib/acciones/guion.ts` | `if (reserva.tope) return "tope"` | `if (reserva.limite) return "tope"` |
| `lib/acciones/ideas.ts` | `if (reserva.tope) {` | `if (reserva.limite) {` |
| `lib/pilares/proponer.ts` | `if (reserva.tope)` | `if (reserva.limite)` |
| `lib/ingesta/gasto-material.ts` | `if (reserva.tope) return TOPE` | `if (reserva.limite) return TOPE` |

- [ ] **Step 5: Run, expect PASS** — `pnpm type`, `pnpm test:run tests/unit/reserva.test.ts`, `pnpm test:db tests/integration/reserva-de-gasto.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/datos/repositorio.ts lib/produccion/producir.ts lib/produccion/carrusel.ts lib/produccion/armar-carrusel.ts lib/produccion/voz.ts lib/produccion/grabar.ts lib/acciones/guion.ts lib/acciones/ideas.ts lib/pilares/proponer.ts lib/ingesta/gasto-material.ts tests/unit/reserva.test.ts tests/integration/reserva-de-gasto.test.ts
git commit -m "Read both stop codes in the repository and reserve signed work over the limit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: One notice a month at the limit

**Files:**
- Create: `lib/presupuesto/limite.ts`, `tests/integration/avisar-limite.test.ts`
- Modify: `lib/avisos/registro.ts`

- [ ] **Step 1: Write the failing test** (`tests/integration/avisar-limite.test.ts`)

```ts
import { afterAll, afterEach, describe, expect, it } from "vitest"
import { notificadorConRegistro } from "@/lib/avisos/registrado"
import { rutaDeAviso } from "@/lib/avisos/tipos"
import {
  avisarLimite,
  claveDelAvisoDeLimite,
  mesDelGasto,
  TEXTO_LIMITE,
  textoDelAvisoDeLimite,
} from "@/lib/presupuesto/limite"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
import { pool } from "./db"
import { clienteDeServicio } from "./servicio"

const NOVIEMBRE = "2026-11-15T15:00:00.000Z"
const DICIEMBRE = "2026-12-02T15:00:00.000Z"
const db = clienteDeServicio()

afterEach(() => pool.query("delete from public.avisos where clave like 'limite_alcanzado:%'"))
afterAll(() => pool.end())

function conRegistro() {
  const canal = notificadorEnMemoria()
  return { canal, avisos: notificadorConRegistro({ db, canal, ahora: () => NOVIEMBRE }) }
}

describe("mesDelGasto", () => {
  it("is the Santiago month, as the database counts it", () => {
    expect(mesDelGasto("2026-11-01T02:00:00Z")).toBe("2026-10")
    expect(mesDelGasto("2026-11-01T03:00:00Z")).toBe("2026-11")
    expect(claveDelAvisoDeLimite("2026-11")).toBe("limite_alcanzado:2026-11")
  })
})

describe("avisarLimite", () => {
  it("tells Coni once a month, urgently and with her limit, and WAV once", async () => {
    const { canal, avisos } = conRegistro()

    await avisarLimite({ db, avisos }, NOVIEMBRE)
    await avisarLimite({ db, avisos }, NOVIEMBRE)

    expect(textoDelAvisoDeLimite(80)).toBe(
      "Llegaste a tu límite de US$ 80,00 de este mes. Lo nuevo quedó en pausa; lo que ya firmaste sigue.",
    )
    expect(canal.aConiEnviados).toEqual([{ mensaje: textoDelAvisoDeLimite(80), urgente: true }])
    expect(canal.avisosEnviados).toEqual([{ tipo: "limite_alcanzado", clave: "limite_alcanzado:2026-11" }])
    expect(canal.aWavEnviados).toHaveLength(1)
    expect(canal.aWavEnviados[0]?.asunto).toBe("Coni llegó a su límite de gasto (2026-11)")
  })

  it("tells both again in a new month", async () => {
    const { canal, avisos } = conRegistro()

    await avisarLimite({ db, avisos }, NOVIEMBRE)
    await avisarLimite({ db, avisos }, DICIEMBRE)

    expect(canal.avisosEnviados.map((aviso) => aviso.clave)).toEqual([
      "limite_alcanzado:2026-11",
      "limite_alcanzado:2026-12",
    ])
    expect(canal.aWavEnviados).toHaveLength(2)
  })

  it("opens Ajustes, Presupuesto", () => {
    expect(rutaDeAviso({ tipo: "limite_alcanzado" })).toBe("/ajustes/presupuesto")
  })

  it("lets a failed notice fail the caller, so the run shows it", async () => {
    const canal = {
      ...notificadorEnMemoria(),
      aConi: async () => {
        throw new Error("Resend no responde")
      },
    }
    const avisos = notificadorConRegistro({ db, canal, ahora: () => NOVIEMBRE })

    await expect(avisarLimite({ db, avisos }, NOVIEMBRE)).rejects.toThrow("Resend no responde")
  })

  it("is said in one line every stopped path shares", () => {
    expect(TEXTO_LIMITE).toBe("Llegaste a tu límite de este mes. Reactívalo en Ajustes.")
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:db tests/integration/avisar-limite.test.ts` (no `lib/presupuesto/limite.ts`).

- [ ] **Step 3: Add `existeAviso`** to `lib/avisos/registro.ts`, after `registrarAviso`:

```ts
/** Whether a notice with this key was already stored, whatever its state. */
export async function existeAviso(db: Db, clave: string): Promise<boolean> {
  const { data, error } = await db.from("avisos").select("id").eq("clave", clave).maybeSingle()
  if (error) throw fallo("leer un aviso", error)
  return data !== null
}
```

- [ ] **Step 4: Create `lib/presupuesto/limite.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { existeAviso } from "@/lib/avisos/registro"
import { limiteDelMes } from "@/lib/datos/repositorio"
import { diaLocal } from "@/lib/dominio/fechas"
import { dolares } from "@/lib/formato"
import type { Notificador } from "@/lib/proveedores/avisos"
import type { Database } from "@/lib/supabase/database.types"

/** The month `reservar_gasto` counts in (supabase/migrations/20261103000100_presupuesto.sql). */
export const ZONA_DEL_GASTO = "America/Santiago"

/** What every path stopped by the hard limit says (spec 2026-11-02). */
export const TEXTO_LIMITE = "Llegaste a tu límite de este mes. Reactívalo en Ajustes."

/** «2026-11»: the Santiago month of an instant, the one the database counts the spend in. */
export function mesDelGasto(ahora: string): string {
  return diaLocal(Date.parse(ahora), ZONA_DEL_GASTO).slice(0, 7)
}

/** Notices dedupe by key: one key per month means one notice per month. */
export function claveDelAvisoDeLimite(mes: string): string {
  return `limite_alcanzado:${mes}`
}

export function textoDelAvisoDeLimite(limiteUsd: number): string {
  return `Llegaste a tu límite de ${dolares(limiteUsd)} de este mes. Lo nuevo quedó en pausa; lo que ya firmaste sigue.`
}

export interface DepsDelAvisoDeLimite {
  /** A `service_role` client. */
  db: SupabaseClient<Database>
  avisos: Notificador
}

/**
 * The hard limit stopped something new (D3): Coni gets one urgent notice a month, which opens Ajustes › Presupuesto,
 * and WAV one email, only the first time. A failed notice propagates: it never lets the spend through, and the run's
 * result shows it.
 */
export async function avisarLimite(deps: DepsDelAvisoDeLimite, ahora: string): Promise<void> {
  const mes = mesDelGasto(ahora)
  const clave = claveDelAvisoDeLimite(mes)
  const yaAvisado = await existeAviso(deps.db, clave)
  const limite = await limiteDelMes(deps.db, ahora)
  await deps.avisos.aConi(textoDelAvisoDeLimite(limite), true, { tipo: "limite_alcanzado", clave })
  if (yaAvisado) return
  await deps.avisos.aWav(
    `Coni llegó a su límite de gasto (${mes})`,
    `El gasto nuevo quedó en pausa al llegar a ${dolares(limite)} en ${mes}. Lo firmado sigue. Coni lo reactiva en Ajustes, Presupuesto.`,
  )
}
```

- [ ] **Step 5: Run, expect PASS** — `pnpm test:db tests/integration/avisar-limite.test.ts tests/integration/avisos-registrado.test.ts` and `pnpm type`.

- [ ] **Step 6: Commit**

```bash
git add lib/presupuesto/limite.ts lib/avisos/registro.ts tests/integration/avisar-limite.test.ts
git commit -m "Tell Coni once a month, and WAV once, when the hard limit stops new spend" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The script and carousel writers stop at the limit

**Files:**
- Modify: `lib/produccion/producir.ts`, `lib/produccion/carrusel.ts`
- Test: `tests/integration/producir.test.ts`, `tests/integration/producir-carrusel.test.ts`

- [ ] **Step 1: Move the writer tests to the new rule.** In `tests/integration/producir.test.ts` delete the line `const TOPE = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir."`, add the import

```ts
import { claveDelAvisoDeLimite, mesDelGasto, TEXTO_LIMITE, textoDelAvisoDeLimite } from "@/lib/presupuesto/limite"
```

and replace the test `"writes only an explanation, and calls nobody, when the monthly cap is reached"` with:

```ts
  it("writes only an explanation, calls nobody and tells her, when the month's limit is reached", async () => {
    await pool.query("delete from public.avisos where clave like 'limite_alcanzado:%'")
    const id = await crearPiezaEnProduccion()
    // A cap of 0 makes a limit of 0: nothing new fits.
    await pool.query("update public.ajustes set tope_mensual_usd = 0")
    const sim = simular()
    const avisos = notificadorEnMemoria()

    const resultado = await producirPieza(deps(avisos), id)

    expect(resultado).toEqual({ resultado: "limite" })
    expect(avisos.aConiEnviados).toEqual([{ mensaje: textoDelAvisoDeLimite(0), urgente: true }])
    expect(avisos.avisosEnviados).toEqual([
      { tipo: "limite_alcanzado", clave: claveDelAvisoDeLimite(mesDelGasto(new Date().toISOString())) },
    ])
    expect(avisos.aWavEnviados).toHaveLength(1)
    const fila = await pieza(id)
    expect(fila).toMatchObject({ estado: "guion_en_proceso", explicacion: TEXTO_LIMITE, guion: null, audio_id: null })
    expect(fila.version).toBe(2)
    expect(sim.escrituras).toHaveLength(0)
    expect(sim.voces).toHaveLength(0)
    expect(await gastos(id)).toEqual([])
  })
```

In `tests/integration/producir-carrusel.test.ts` replace the line `const TOPE = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir."` with `import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"` placed with the other imports, and replace the test `"spends nothing over the monthly cap and says why"` with:

```ts
  it("spends nothing at the month's limit and says why", async () => {
    const id = await carruselEnEscritura()
    const sim = simular()
    await pool.query("update public.ajustes set tope_mensual_usd = 0")

    expect(await producirPieza(deps(), id)).toEqual({ resultado: "limite" })

    expect(sim.escrituras).toHaveLength(0)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_en_proceso", explicacion: TEXTO_LIMITE })
  })
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:db tests/integration/producir.test.ts tests/integration/producir-carrusel.test.ts -t "limit"` (the writers still answer `"tope"` with the old text).

- [ ] **Step 3: Implement.** In `lib/produccion/producir.ts`:
  - in the import from `@/lib/produccion/comun` delete the lines `avisarTope,` and `TEXTO_TOPE,`, and add `import { avisarLimite, TEXTO_LIMITE } from "@/lib/presupuesto/limite"`;
  - in `ResultadoProduccion` replace `| { resultado: "tope" }` with `| { resultado: "limite" }`;
  - replace the block after the Claude reservation with:

```ts
  if (reservaClaude.limite) {
    await explicar(deps, fila, TEXTO_LIMITE)
    await avisarLimite(deps, deps.ahora())
    return { resultado: "limite" }
  }
```

In `lib/produccion/carrusel.ts`: in the import from `@/lib/produccion/comun` delete `avisarTope,` and `TEXTO_TOPE,`, add `import { avisarLimite, TEXTO_LIMITE } from "@/lib/presupuesto/limite"`, and replace the block after its reservation with:

```ts
  if (reserva.limite) {
    await explicar(deps, fila, TEXTO_LIMITE)
    await avisarLimite(deps, deps.ahora())
    return { resultado: "limite" }
  }
```

- [ ] **Step 4: Run, expect PASS** — `pnpm type`, `pnpm test:db tests/integration/producir.test.ts tests/integration/producir-carrusel.test.ts tests/integration/carrusel-funciones.test.ts tests/integration/datos-carrusel.test.ts`. (The draft-voice test of `producir.test.ts`, «delivers the script without a voice when the month has no room left for it», keeps passing: the voice of a draft is new spend.)

- [ ] **Step 5: Commit**

```bash
git add lib/produccion/producir.ts lib/produccion/carrusel.ts tests/integration/producir.test.ts tests/integration/producir-carrusel.test.ts
git commit -m "Stop the script and carousel writers at the month's limit and tell Coni" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Her voice: new before gate 1, signed after it

**Files:**
- Modify: `lib/produccion/voz.ts`, `lib/produccion/grabar-voz.ts`, `lib/produccion/grabar.ts` (`ponerLaVoz`)
- Test: `tests/integration/grabar-voz.test.ts`, `tests/integration/grabar.test.ts`

Which voice is signed is decided by the piece's state, not by the function (P4). In `lib/dominio/estados.ts` the gate-1 signature (`aprobar_guion`) is the only event that sets `puerta1` and moves a reel to `en_render`; `grabando_voz` is reached only from `guion_por_aprobar` (event `pedir_voz`), with no signature. So: the voice of the draft (`producir.ts`, piece in `guion_en_proceso`) and «Preparar mi voz» or any new take (`grabar-voz.ts`, piece in `grabando_voz`) are new spend and stop at the limit; the voice made inside the recording (`grabar.ts`, piece in `en_render` with `puerta1_hash`) is signed work and never stops. The draft-voice test of `producir.test.ts`, «delivers the script without a voice when the month has no room left for it», keeps passing unchanged: the voice of the draft still stops and the script is delivered with `TEXTO_SIN_VOZ`.

- [ ] **Step 1: Move the voice tests to the new rule.**

In `tests/integration/grabar-voz.test.ts` replace the import line `import { TEXTO_TOPE } from "@/lib/produccion/comun"` with `import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"` and replace the test `"explains the cap and spends nothing when the voice would pass it"` with:

```ts
  it("refuses a new voice before gate 1 at the month's limit, spends nothing and tells her", async () => {
    // A cap of 0 makes a limit of 0: a voice not yet signed is new spend.
    await pool.query("update public.ajustes set tope_mensual_usd = 0")
    const id = await grabando()
    const avisos = notificadorEnMemoria()
    const d = { ...deps(), avisos }

    expect(await grabarVoz(d, { piezaId: id, nueva: false })).toEqual({ resultado: "limite" })
    expect(llamadas).toBe(0)
    expect(await leerFila(id)).toMatchObject({ estado: "guion_por_aprobar", explicacion: TEXTO_LIMITE })
    expect(avisos.avisosEnviados.map((aviso) => aviso.tipo)).toEqual(["limite_alcanzado"])
  })
```

In `tests/integration/grabar.test.ts`, inside `describe("grabarPieza con la voz después de la puerta 1")`, replace the two tests `"explains the cap and records nothing when the voice alone would pass it"` and `"keeps the voice and finishes the render after the cap is raised"` with:

```ts
  it("makes the voice of an approved piece and records over the month's limit: both are signed work", async () => {
    const id = await crearPiezaSinVoz()
    const sim = simular()
    await conTopeMensual(estimarCostoVoz(GUION) / 4)
    const d = doble()

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")

    expect(sim.voces).toHaveLength(1)
    expect(sim.creaciones).toHaveLength(1)
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado])).toEqual([
      ["elevenlabs", "confirmado"],
      ["heygen", "confirmado"],
    ])
  })

  it("says nothing about the limit while it records an approved piece over it", async () => {
    const id = await crearPiezaSinVoz()
    simular()
    await conTopeMensual(0)
    const avisos = notificadorEnMemoria()
    const d = doble({ avisos })

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")

    expect(avisos.avisosEnviados.map((aviso) => aviso.tipo)).not.toContain("limite_alcanzado")
  })
```

and replace the test `"spends nothing on HeyGen when the voice is rejected and the new one is stopped by the cap"` with:

```ts
  it("speaks the approved script again and records when the stored voice was of another text, even at the limit", async () => {
    const id = await crearPiezaSinVoz()
    const ajena = claveDeToma(id, huellaDelGuion("Otro texto que Coni no aprobó.", ELEVENLABS), 0)
    await enTransaccion(async (c) => {
      await aplicar(c, id, comoServicio, { tipo: "voz_lista", audioId: ajena })
    })
    await conTopeMensual(0)
    const sim = simular()
    const d = doble()
    await d.almacen.subir(ajena, new Uint8Array([7, 7, 7]), "audio/mpeg")

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")
    expect(sim.voces).toHaveLength(1)
    expect(sim.creaciones).toHaveLength(1)
  })
```

(`crearPiezaSinVoz` walks the real flow through the gate-1 signature: the piece is in `en_render` with `puerta1_hash`.)

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:db tests/integration/grabar-voz.test.ts tests/integration/grabar.test.ts -t "limit"` (the voice of an approved piece still stops; the refused new voice still answers `"tope"` with the old text).

- [ ] **Step 3: Implement.** In `lib/produccion/voz.ts`:
  - in the import from `@/lib/datos/repositorio` add `reservarGastoFirmado,` next to `reservarGasto,`;
  - replace `export type VozAsegurada = { tipo: "lista"; audioId: string } | { tipo: "tope" }` with:

```ts
export type VozAsegurada = { tipo: "lista"; audioId: string } | { tipo: "limite" }

/**
 * Spec 2026-11-02, D1: only the voice of a piece already signed at gate 1 is signed work. The signature
 * (`aprobar_guion`) is what sets `puerta1_hash` and moves a reel to `en_render`; the voice of a draft
 * (`guion_en_proceso`) or of «Preparar mi voz» (`grabando_voz`) is new spend and stops at the month's limit.
 */
export function vozFirmada(fila: FilaDePieza): boolean {
  return fila.estado === "en_render" && fila.puerta1_hash !== null
}
```

  - in `reservarIntento` replace the return type `Promise<{ tipo: "tope" } | { tipo: "lista" } | { tipo: "reservada"; clave: string }>` with `Promise<{ tipo: "limite" } | { tipo: "lista" } | { tipo: "reservada"; clave: string }>`, and replace the body of the `for` loop from `const reserva = await reservarGasto(deps.db, {` down to the line before `if (reserva.gasto.estado === "confirmado") {` with:

```ts
    const pedido = {
      piezaId: fila.id,
      proveedor: "elevenlabs" as const,
      paso: "voz",
      estimadoUsd: estimado,
      clave,
      ahora: deps.ahora(),
      // Only a key released as a refusal (sin_cobro) reopens; a sweeper release stays closed and comes back `liberado`.
      reabrir: true,
      reservadoPor: token,
    }
    let gasto: FilaDeGasto
    if (vozFirmada(fila)) {
      gasto = await reservarGastoFirmado(deps.db, pedido)
    } else {
      const reserva = await reservarGasto(deps.db, pedido)
      if (reserva.limite) return { tipo: "limite" }
      gasto = reserva.gasto
    }
    // Reserved by another try (unknown outcome, or still running): calling again under it would go uncounted.
    if (gasto.estado === "reservado" && gasto.reservado_por === token) return { tipo: "reservada", clave }
```

    and in the next lines of the loop replace `if (reserva.gasto.estado === "confirmado") {` with `if (gasto.estado === "confirmado") {`. Add `type FilaDeGasto,` to the import from `@/lib/datos/repositorio`;
  - in `asegurarVoz` replace `if (reserva.tipo === "tope") return { tipo: "tope" }` with `if (reserva.tipo === "limite") return { tipo: "limite" }`.

In `lib/produccion/producir.ts` nothing changes in `vozDelBorrador`: `if (voz.tipo === "lista") return { audioId: voz.audioId }` already falls through to `TEXTO_SIN_VOZ` for `"limite"`.

In `lib/produccion/grabar-voz.ts`:
  - replace `import { avisarTope, piezaCambio, TEXTO_TOPE } from "@/lib/produccion/comun"` with `import { piezaCambio } from "@/lib/produccion/comun"` and add `import { avisarLimite, TEXTO_LIMITE } from "@/lib/presupuesto/limite"`;
  - in `ResultadoVoz` replace `| { resultado: "tope" }` with `| { resultado: "limite" }`;
  - replace the block

```ts
    if (voz.tipo === "tope") {
      await escribir(deps, fila, { tipo: "falla_voz", explicacion: TEXTO_TOPE })
      await avisarTope(deps, fila)
      return { resultado: "tope" }
    }
```

    with

```ts
    // The piece is still at gate 1 (`grabando_voz`): its voice is new spend, and the month's limit stops it.
    if (voz.tipo === "limite") {
      await escribir(deps, fila, { tipo: "falla_voz", explicacion: TEXTO_LIMITE })
      await avisarLimite(deps, deps.ahora())
      return { resultado: "limite" }
    }
```

In `lib/produccion/grabar.ts` replace `ponerLaVoz` with:

```ts
/** The voice of the approved script, reused when it exists, written into the piece. Signed work: never stopped. */
async function ponerLaVoz(contexto: Contexto): Promise<void> {
  const { deps, config } = contexto
  const voz = await asegurarVoz(deps, {
    fila: contexto.fila,
    guion: contexto.guion,
    config: config.elevenlabs,
    llave: () => leerLlaveDeVoz(deps.db, config),
    nueva: false,
  })
  // The piece is in `en_render` with its gate-1 signature, so `vozFirmada` holds: a limit here breaks the contract.
  if (voz.tipo === "limite") throw new Error(`La voz firmada de la pieza ${contexto.fila.id} frenó en el límite del mes.`)
  await escribir(contexto, { tipo: "voz_lista", audioId: voz.audioId })
}
```

and in `avanzar` replace

```ts
  if (enRender && vozAprobada(contexto) === null && !(await ponerLaVoz(contexto))) {
    return { resultado: "tope" }
  }
```

with

```ts
  if (enRender && vozAprobada(contexto) === null) await ponerLaVoz(contexto)
```

- [ ] **Step 4: Run, expect PASS** — `pnpm type`, then `pnpm test:db tests/integration/grabar-voz.test.ts tests/integration/producir.test.ts tests/integration/grabar.test.ts -t "voz|voice|limit"` (the draft-voice test of `producir.test.ts` passes as it is). The video test of `grabar.test.ts` «explains the cap to Coni and makes no request when the spend would pass it» changes in Task 6.

- [ ] **Step 5: Commit**

```bash
git add lib/produccion/voz.ts lib/produccion/grabar-voz.ts lib/produccion/grabar.ts tests/integration/grabar-voz.test.ts tests/integration/grabar.test.ts
git commit -m "Stop a new voice at the month's limit and let the voice of a signed piece through" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The video and the shortening of a signed carousel are signed work

**Files:**
- Modify: `lib/produccion/grabar.ts`, `lib/produccion/armar-carrusel.ts`, `lib/produccion/comun.ts`
- Test: `tests/integration/grabar.test.ts`, `tests/integration/armar-carrusel.test.ts`

- [ ] **Step 1: Move the tests to the new rule.**

In `tests/integration/grabar.test.ts` rename `describe("grabarPieza sin llave o con el tope alcanzado"` to `describe("grabarPieza sin llave o sobre el límite"`, delete the line `const TOPE = "Llegaste al tope de gasto de este mes. Súbelo en Ajustes para seguir."` and replace the test `"explains the cap to Coni and makes no request when the spend would pass it"` with:

```ts
  it("records over the month's limit, because the video is signed work, and tells nobody about the limit", async () => {
    const id = await crearPiezaEnRender()
    const sim = simular()
    // A limit of US$ 0,10 is under the estimate of this video (ESTIMADO).
    await pool.query("update public.ajustes set tope_mensual_usd = 0.05")
    const avisos = notificadorEnMemoria()
    const d = doble({ avisos })
    await conVozEnAlmacen(d.almacen, id)

    expect((await grabarPieza(d.deps, id)).resultado).toBe("grabada")

    expect(sim.creaciones).toHaveLength(1)
    expect(avisos.avisosEnviados.map((aviso) => aviso.tipo)).not.toContain("limite_alcanzado")
    expect((await gastos(id)).map((g) => [g.proveedor, g.estado])).toEqual([["heygen", "confirmado"]])
  })
```

In `tests/integration/armar-carrusel.test.ts` replace the test `"tells her the monthly cap stopped the shortening, not that the slide is simply long, and tells WAV"` with:

```ts
  it("shortens over the month's limit, because the carousel is signed, and warns nobody about the limit", async () => {
    const id = await carrusel()
    servidor.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
        HttpResponse.json({
          id: "msg_prueba",
          type: "message",
          role: "assistant",
          model: "claude-opus-5-5",
          content: [
            { type: "text", text: JSON.stringify({ laminas: [{ numero: 4, texto: "No ve cómo cambia tu voz." }] }) },
          ],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 900, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 800 },
        }),
      ),
    )
    const { rows } = await pool.query<{ tope: string }>("select tope_mensual_usd as tope from public.ajustes")
    await pool.query("update public.ajustes set tope_mensual_usd = 0")
    try {
      const d = doble([{ tipo: "desborda", laminas: [3] }])
      expect(await armarCarrusel(d.deps, id)).toEqual({ resultado: "acortado" })

      expect(d.avisos.avisosEnviados.map((aviso) => aviso.tipo)).not.toContain("limite_alcanzado")
      const nueva = await leerVersionVigente(clienteDeServicio(), id)
      expect(nueva).toMatchObject({ origen: "acortado", estado: "escrito" })
    } finally {
      await pool.query("update public.ajustes set tope_mensual_usd = $1", [rows[0]?.tope])
    }
  })
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:db tests/integration/grabar.test.ts tests/integration/armar-carrusel.test.ts -t "limit"`.

- [ ] **Step 3: Implement.** In `lib/produccion/grabar.ts`:
  - in the import from `@/lib/datos/repositorio` replace `reservarGasto,` with `reservarGastoFirmado,`;
  - replace `import { aCuatroDecimales, avisarTope, explicar, MINIMO_USD, piezaCambio, TEXTO_TOPE } from "@/lib/produccion/comun"` with `import { aCuatroDecimales, MINIMO_USD, piezaCambio } from "@/lib/produccion/comun"`;
  - delete `| { resultado: "tope" }` from `ResultadoGrabacion`;
  - in `avanzar` replace from `const reserva = await reservarGasto(db, {` down to `const { gasto } = reserva` with:

```ts
  // The video is signed work (spec 2026-11-02, D1): the month's limit never stops it.
  const gasto = await reservarGastoFirmado(db, {
    piezaId: contexto.fila.id,
    proveedor: "heygen",
    paso: "grabar",
    estimadoUsd: estimado,
    clave: contexto.clave,
    ahora: deps.ahora(),
  })
```

In `lib/produccion/armar-carrusel.ts`:
  - in the import from `@/lib/datos/repositorio` replace `reservarGasto,` with `reservarGastoFirmado,`;
  - replace `import { aCuatroDecimales, avisarTope, ESTIMADO_ACORTAR_CLAUDE_USD, piezaCambio } from "./comun"` with `import { aCuatroDecimales, ESTIMADO_ACORTAR_CLAUDE_USD, piezaCambio } from "./comun"`;
  - delete the exported function `textoTopeAlAcortar` (its doc comment included);
  - in `acortar` replace from `const reserva = await reservarGasto(db, {` down to the line `if (reserva.gasto.estado !== "reservado") {` with:

```ts
  // The carousel is signed (it waits for its slides after gate 1): the month's limit never stops its one shortening.
  const gasto = await reservarGastoFirmado(db, {
    piezaId: fila.id,
    proveedor: "anthropic",
    paso: "carrusel",
    estimadoUsd: ESTIMADO_ACORTAR_CLAUDE_USD,
    clave,
    ahora: deps.ahora(),
  })
  // A refusal released it before: asking again would only be refused again, and cost money. A confirmed one means
  // Claude already answered and the save failed: asking again would pay twice for the one shortening.
  if (gasto.estado !== "reservado") {
```

    and on the next line replace `if (reserva.gasto.estado === "confirmado") {` with `if (gasto.estado === "confirmado") {`.

In `lib/produccion/comun.ts` delete `avisarTope` with its doc comment (no caller is left) and the import it alone used, `import type { Notificador } from "@/lib/proveedores/avisos"`. Keep `TEXTO_TOPE` until Task 7 (the batch still imports it).

- [ ] **Step 4: Run, expect PASS** — `pnpm type`, `pnpm test:db tests/integration/grabar.test.ts tests/integration/armar-carrusel.test.ts tests/integration/grabar-voz.test.ts`, `grep -rn "avisarTope\|textoTopeAlAcortar" lib app trigger` → nothing.

- [ ] **Step 5: Commit**

```bash
git add lib/produccion/grabar.ts lib/produccion/armar-carrusel.ts lib/produccion/comun.ts tests/integration/grabar.test.ts tests/integration/armar-carrusel.test.ts
git commit -m "Make the video and the shortening of a signed carousel signed work" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Script review, idea classification, the batch and the reclassification stop at the limit

**Files:**
- Modify: `lib/datos/pantallas.ts` (`leerPresupuesto`), `lib/dominio/lote.ts`, `lib/acciones/guion.ts`, `lib/acciones/ideas.ts`, `lib/acciones/piezas.ts`, `lib/pilares/proponer.ts`, `lib/produccion/comun.ts`
- Test: `tests/unit/lote.test.ts`, `tests/integration/acciones-guion.test.ts`, `tests/integration/acciones-ideas.test.ts`, `tests/integration/acciones-piezas.test.ts`, `tests/integration/reclasificar.test.ts`

- [ ] **Step 1: Move the tests to the new rule.**

In `tests/unit/lote.test.ts` replace the whole `describe("cuantasAlcanzan", …)` block with:

```ts
describe("cuantasAlcanzan", () => {
  it("counts the scripts the month still covers, the way reservar_gasto refuses (usado + estimado > limite)", () => {
    expect(cuantasAlcanzan({ limite: 80, usado: 0, estimadoPorGuion: 1.1, pedidas: 5 })).toBe(5)
    expect(cuantasAlcanzan({ limite: 80, usado: 77.8, estimadoPorGuion: 1.1, pedidas: 5 })).toBe(2)
    // Exactly at the limit still passes: 2 x 1.1 = 2.2 = 80 - 77.8.
    expect(cuantasAlcanzan({ limite: 80, usado: 77.8, estimadoPorGuion: 1.1, pedidas: 2 })).toBe(2)
  })

  it("says none when the month reached or passed its limit, and never more than asked", () => {
    expect(cuantasAlcanzan({ limite: 80, usado: 80, estimadoPorGuion: 1.1, pedidas: 3 })).toBe(0)
    expect(cuantasAlcanzan({ limite: 80, usado: 81, estimadoPorGuion: 1.1, pedidas: 3 })).toBe(0)
    expect(cuantasAlcanzan({ limite: 0, usado: 0, estimadoPorGuion: 1.1, pedidas: 3 })).toBe(0)
    expect(cuantasAlcanzan({ limite: 1000, usado: 0, estimadoPorGuion: 1.1, pedidas: 3 })).toBe(3)
  })
})
```

In `tests/integration/acciones-guion.test.ts` add `import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"`, rename the test `"stops at the monthly cap without writing"` to `"stops at the month's limit without writing"` and in it replace `expect(resultado).toMatchObject({ ok: false, motivo: "tope" })` with `expect(resultado).toMatchObject({ ok: false, motivo: "limite", error: TEXTO_LIMITE })`.

In `tests/integration/acciones-ideas.test.ts` add `import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"`, rename `"stops at the monthly cap before calling Claude"` to `"stops at the month's limit before calling Claude"` and in it replace `expect(resultado).toMatchObject({ ok: false, error: expect.stringContaining("tope") })` with `expect(resultado).toEqual({ ok: false, error: TEXTO_LIMITE })`.

In `tests/integration/acciones-piezas.test.ts`, inside `describe("elegirLote")`, replace the helper and its `afterEach` with:

```ts
  async function limiteConLugarPara(guiones: number): Promise<void> {
    const { usado } = await leerPresupuesto(coni, Date.now(), "America/Santiago")
    const limite = usado + guiones * 1.1 + 0.05
    // Cap and limit at the same figure, so the batch is checked against exactly this room.
    await pool.query("update public.ajustes set tope_mensual_usd = $1, limite_duro_usd = $1", [limite])
  }
  afterEach(async () => {
    await pool.query("update public.ajustes set tope_mensual_usd = 40, limite_duro_usd = null")
  })
```

and rename the five calls `topeConLugarPara(` to `limiteConLugarPara(` (same arguments). Add, in the same `describe`:

```ts
  it("checks the batch against the limit, not the cap: past the cap the scripts still start", async () => {
    const [a, b] = [await idea(), await idea()]
    const { usado } = await leerPresupuesto(coni, Date.now(), "America/Santiago")
    // The cap alone covers at most one script; twice the cap (the default limit) covers both.
    await pool.query("update public.ajustes set tope_mensual_usd = $1", [usado / 2 + 1.2])
    const { deps } = armar()

    const resultado = await elegirLote(deps, [a, b])

    expect(resultado).toMatchObject({ ok: true, tipo: "empezadas" })
    if (resultado.ok && resultado.tipo === "empezadas") piezasCreadas.push(...piezasDe(resultado.resultados))
  })
```

In `tests/integration/reclasificar.test.ts` rename `"stops before calling Claude when the monthly cap cannot cover the estimate"` to `"stops before calling Claude when the month's limit cannot cover the estimate"` and replace `rejects.toThrow("El tope mensual no alcanza para la reclasificación.")` with `rejects.toThrow("El límite del mes no alcanza para la reclasificación.")`.

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/lote.test.ts` and `pnpm test:db tests/integration/acciones-guion.test.ts tests/integration/acciones-ideas.test.ts tests/integration/acciones-piezas.test.ts tests/integration/reclasificar.test.ts -t "limit|elegirLote"`.

- [ ] **Step 3: Implement.**

`lib/datos/pantallas.ts`: add `limiteDelMes` to the import from `@/lib/datos/repositorio`, and replace `Presupuesto` and `leerPresupuesto` with:

```ts
export interface Presupuesto {
  tope: number
  /** The brake of the month (`limite_del_mes`): this month's row, her limit, or twice the cap. */
  limite: number
  usado: number
}

/** What the month has spent or reserved: a confirmed spend counts its real cost, as `reservar_gasto` counts it. */
export async function leerPresupuesto(db: Db, ahora: number, zona: string): Promise<Presupuesto> {
  const mes = `${diaLocal(ahora, zona).slice(0, 7)}-01`
  const [ajustes, gastos, limite] = await Promise.all([
    db.from("ajustes").select("tope_mensual_usd").maybeSingle(),
    db.from("gastos").select("estado, estimado_usd, real_usd").eq("mes", mes).in("estado", ["reservado", "confirmado"]),
    limiteDelMes(db, new Date(ahora).toISOString()),
  ])
  if (ajustes.error) throw fallo("No pude leer el tope", ajustes.error)
  if (gastos.error) throw fallo("No pude leer los gastos", gastos.error)
  return {
    tope: ajustes.data?.tope_mensual_usd ?? 0,
    limite,
    usado: gastos.data.reduce(
      (suma, gasto) =>
        suma + (gasto.estado === "confirmado" ? (gasto.real_usd ?? gasto.estimado_usd) : gasto.estimado_usd),
      0,
    ),
  }
}
```

`lib/dominio/lote.ts`: replace `cuantasAlcanzan` with:

```ts
/** How many of `pedidas` scripts the month still covers: `reservar_gasto` refuses when `usado + estimado > limite`. */
export function cuantasAlcanzan(entrada: {
  limite: number
  usado: number
  estimadoPorGuion: number
  pedidas: number
}): number {
  const libre = enDiezmilesimos(entrada.limite) - enDiezmilesimos(entrada.usado)
  if (libre <= 0) return 0
  return Math.min(entrada.pedidas, Math.floor(libre / enDiezmilesimos(entrada.estimadoPorGuion)))
}
```

`lib/acciones/piezas.ts`: replace `import { ESTIMADO_POR_GUION_USD, TEXTO_TOPE } from "@/lib/produccion/comun"` with `import { ESTIMADO_POR_GUION_USD } from "@/lib/produccion/comun"` plus `import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"`, and in `elegirLote` replace from `const alcanza = cuantasAlcanzan({` down to `if (alcanza === 0) throw new Falla(TEXTO_TOPE)` with:

```ts
    const alcanza = cuantasAlcanzan({
      limite: presupuesto.limite,
      usado: presupuesto.usado,
      estimadoPorGuion: ESTIMADO_POR_GUION_USD,
      pedidas: ideaIds.length,
    })
    if (alcanza === 0) throw new Falla(TEXTO_LIMITE)
```

Update its doc comment's first sentence to: `"Hacer los guiones (N)" on Ideas (decision 23): the month's limit is checked for the whole batch first.`

`lib/acciones/guion.ts`:
  - delete `import { dolares } from "@/lib/formato"` and add `import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"`;
  - `export type MotivoDeGuion = "revision_bloquea" | "limite" | "sin_version_de_claude"`;
  - replace `if (juicio === "tope") return { motivo: "tope", error: await textoDelTope(db) }` with `if (juicio === "limite") return { motivo: "limite", error: TEXTO_LIMITE }`;
  - delete the function `textoDelTope`;
  - in `juzgarConClaude` change the return type to `Promise<{ hallazgos: Hallazgo[] } | "limite">` and replace `if (reserva.limite) return "tope"` with `if (reserva.limite) return "limite"`.

`lib/acciones/ideas.ts`:
  - delete `import { dolares } from "@/lib/formato"` and add `import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"`;
  - replace the block

```ts
    if (reserva.limite) {
      const { data } = await deps.db.from("ajustes").select("tope_mensual_usd").maybeSingle()
      const tope = data ? ` de ${dolares(data.tope_mensual_usd)}` : ""
      throw new Falla(`Llegaste al tope${tope} de este mes. Súbelo en Ajustes para seguir.`)
    }
```

with

```ts
    if (reserva.limite) throw new Falla(TEXTO_LIMITE)
```

  - in the doc comment of `proponerIdea` replace `so it goes through the monthly cap like every other spend` with `so it goes through the month's limit like every other new spend`.

`lib/pilares/proponer.ts`: replace

```ts
  if (reserva.limite)
    throw new Error("El tope mensual no alcanza para la reclasificación. Súbelo en Ajustes o espera al próximo mes.")
```

with

```ts
  if (reserva.limite)
    throw new Error(
      "El límite del mes no alcanza para la reclasificación. Reactívalo en Ajustes o espera al próximo mes.",
    )
```

and in its doc comment replace `The spend goes through the monthly cap.` with `The spend goes through the month's limit.`

`lib/produccion/comun.ts`: delete `export const TEXTO_TOPE = …` (no reader is left).

- [ ] **Step 4: Run, expect PASS** — `pnpm type`, `pnpm test:run tests/unit/lote.test.ts tests/unit/acciones-de-lote.test.ts tests/unit/barra-de-lote.test.tsx tests/unit/eleccion-de-ideas.test.tsx`, `pnpm test:db tests/integration/acciones-guion.test.ts tests/integration/acciones-ideas.test.ts tests/integration/acciones-piezas.test.ts tests/integration/reclasificar.test.ts tests/integration/guion-versiones.test.ts tests/integration/guardar-borrador.test.ts tests/integration/lote-esquema.test.ts`, and `grep -rn "TEXTO_TOPE\|textoDelTope" lib app` → nothing.

- [ ] **Step 5: Commit**

```bash
git add lib/datos/pantallas.ts lib/dominio/lote.ts lib/acciones/guion.ts lib/acciones/ideas.ts lib/acciones/piezas.ts lib/pilares/proponer.ts lib/produccion/comun.ts tests/unit/lote.test.ts tests/integration/acciones-guion.test.ts tests/integration/acciones-ideas.test.ts tests/integration/acciones-piezas.test.ts tests/integration/reclasificar.test.ts
git commit -m "Stop the review, the idea proposal and the batch at the month's limit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Material ingestion waits at the limit and tells Coni

**Files:**
- Modify: `lib/ingesta/procesar.ts`, `lib/produccion/deps-reales.ts` (`depsProcesar`)
- Test: `tests/integration/procesar-comun.ts`, `tests/integration/procesar-material.test.ts`

- [ ] **Step 1: Move the test to the new rule.** In `tests/integration/procesar-comun.ts` add `import { notificadorEnMemoria } from "@/lib/proveedores/avisos"` and, in `deps`, the line `avisos: notificadorEnMemoria(),` right after `almacen,`. In `tests/integration/procesar-material.test.ts` add the imports

```ts
import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"
import { notificadorEnMemoria } from "@/lib/proveedores/avisos"
```

rename `describe("tope de gasto"` to `describe("límite del mes"` and replace its first test, `"leaves the material in process with the reason and calls no provider"`, with:

```ts
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
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:db tests/integration/procesar-material.test.ts -t "límite del mes"` (`avisos` is not part of `DepsProcesar`; the reason is the old text).

- [ ] **Step 3: Implement.** In `lib/ingesta/procesar.ts`:
  - add `import { avisarLimite, TEXTO_LIMITE } from "@/lib/presupuesto/limite"` and `import type { Notificador } from "@/lib/proveedores/avisos"`;
  - in `DepsProcesar`, after `almacen: Almacen`, add:

```ts
  /** Tells Coni, once a month, that the hard limit stopped a material (spec 2026-11-02). */
  avisos: Notificador
```

  - delete `export const MOTIVO_TOPE = …`;
  - replace `detenidoPorTope` with:

```ts
/**
 * The month's limit stops the run without failing it: the material waits as it is, with the reason, and Reintentar
 * picks it up after she reactivates. No provider is called; Coni is told once a month.
 */
async function detenidoPorTope(ctx: Contexto): Promise<ResultadoProcesar> {
  await actualizarMaterial(ctx.deps.db, ctx.material.id, { motivo_fallo: TEXTO_LIMITE, ...LIBRE })
  await avisarLimite(ctx.deps, ctx.deps.ahora())
  return { resultado: "tope" }
}
```

In `lib/produccion/deps-reales.ts`, in the object `depsProcesar` returns, add `avisos: avisosReales(),` after `almacen: almacenReal(),`.

`lib/motor/semanal.ts` imports `MOTIVO_TOPE` from here: in the same step replace `import { MOTIVO_TOPE } from "@/lib/ingesta/procesar"` with `import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"` and the two uses `MOTIVO_TOPE` with `TEXTO_LIMITE` (in the batch loop: `lotesFallidos.push({ cruces: ids, error: TEXTO_LIMITE })`; in `trabajar`: `return { resultado: "fallida", motivo: TEXTO_LIMITE }`). In `tests/integration/motor-semanal.test.ts` replace `import { MOTIVO_TOPE } from "@/lib/ingesta/procesar"` with `import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"` and `motivo_fallo: MOTIVO_TOPE` with `motivo_fallo: TEXTO_LIMITE`.

- [ ] **Step 4: Run, expect PASS** — `pnpm type`, `pnpm test:db tests/integration/procesar-material.test.ts tests/integration/reintentar-material.test.ts tests/integration/confirmar-costo.test.ts tests/integration/motor-semanal.test.ts -t "límite|limit|cap|tope"`, `grep -rn "MOTIVO_TOPE" lib tests` → nothing.

- [ ] **Step 5: Commit**

```bash
git add lib/ingesta/procesar.ts lib/produccion/deps-reales.ts lib/motor/semanal.ts tests/integration/procesar-comun.ts tests/integration/procesar-material.test.ts tests/integration/motor-semanal.test.ts
git commit -m "Keep a material waiting at the month's limit and tell Coni once" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The weekly engine: its switch and the notice at the limit

**Files:**
- Create: `lib/presupuesto/interruptores.ts`
- Modify: `lib/motor/semanal.ts`, `lib/produccion/deps-reales.ts` (`depsMotor`)
- Test: `tests/integration/motor-semanal.test.ts`

- [ ] **Step 1: Write the failing tests.** In `tests/integration/motor-semanal.test.ts`:
  - add `import { notificadorEnMemoria, type NotificadorEnMemoria } from "@/lib/proveedores/avisos"`;
  - replace `function deps(): DepsDelMotor { … }` with:

```ts
function deps(avisos: NotificadorEnMemoria = notificadorEnMemoria()): DepsDelMotor {
  return {
    db,
    almacen: almacenEnMemoria(),
    avisos,
    ahora: () => new Date().toISOString(),
    claude: new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 }),
  }
}
```

  - in the test `"fails the run with the cap motive and no ideas when the monthly cap is reached"`, rename it to `"fails the run with the limit motive and no ideas, and tells Coni, when the month's limit is reached"`, create `const avisos = notificadorEnMemoria()` before the `try`, call `correrMotor(deps(avisos), { semana: SEMANA, manual: false })`, and add at the end:

```ts
    expect(avisos.avisosEnviados.map((aviso) => aviso.tipo)).toEqual(["limite_alcanzado"])
```

  - add a new `describe` at the end of the file:

```ts
describe("el interruptor del motor", () => {
  afterEach(() => pool.query("update public.ajustes set motor_semanal_activo = true"))

  it("skips the Sunday run, without registering it, when Coni turned it off", async () => {
    await pool.query("update public.ajustes set motor_semanal_activo = false")

    expect(await correrMotor(deps(), { semana: SEMANA, manual: false })).toEqual({ resultado: "apagado" })
    expect(await corrida()).toBeUndefined()
  })

  it("still runs «Proponer ahora» with the switch off: she asked for it", async () => {
    await pool.query("update public.ajustes set motor_semanal_activo = false")

    const resultado = await correrMotor(deps(), { semana: SEMANA, manual: true })

    expect(resultado.resultado).not.toBe("apagado")
    expect(await corrida()).toBeDefined()
  })
})
```

  (`corrida()` answers `undefined` when the week has no run; `SEMANA` and the `limpiar` hooks are the file's own.)

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:db tests/integration/motor-semanal.test.ts` (`avisos` is not part of `DepsDelMotor`, no `"apagado"`).

- [ ] **Step 3: Create `lib/presupuesto/interruptores.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"

/** What spends by itself today (spec 2026-11-02, D2): ON by default, Coni turns it off in Ajustes › Presupuesto. */
export interface Interruptores {
  motorSemanal: boolean
  fusionesNocturnas: boolean
}

export async function leerInterruptores(db: SupabaseClient<Database>): Promise<Interruptores> {
  const { data, error } = await db
    .from("ajustes")
    .select("motor_semanal_activo, fusiones_nocturnas_activas")
    .maybeSingle()
  if (error) throw new Error(`No pude leer los interruptores de Ajustes: ${error.message}`, { cause: error })
  if (!data) throw new Error("Falta la fila de ajustes.")
  return { motorSemanal: data.motor_semanal_activo, fusionesNocturnas: data.fusiones_nocturnas_activas }
}
```

- [ ] **Step 4: Implement in `lib/motor/semanal.ts`.**
  - Add `import { avisarLimite, TEXTO_LIMITE } from "@/lib/presupuesto/limite"` (merge with the `TEXTO_LIMITE` import of Task 8), `import { leerInterruptores } from "@/lib/presupuesto/interruptores"` and `import type { Notificador } from "@/lib/proveedores/avisos"`.
  - In `DepsDelMotor` add `avisos: Notificador` after `almacen: Almacen`.
  - In `ResultadoDelMotor` add `| { resultado: "apagado" }` as the first member.
  - Add, before `correrMotor`:

```ts
/** A run the month's limit stopped, whole or in part: Coni hears it once a month (spec 2026-11-02). */
function llegoAlLimite(trabajo: Trabajo): boolean {
  if (trabajo.resultado === "fallida") return trabajo.motivo === TEXTO_LIMITE
  return trabajo.resumen.lotesFallidos.some((lote) => lote.error === TEXTO_LIMITE)
}
```

  - Add, before `correrMotor`, the closing of a run as its own function (the run's result is needed after the `try`):

```ts
/** Works the week and closes its run either way: failed with the Spanish motive, or ready with its summary. */
async function trabajarYCerrar(deps: DepsDelMotor, semana: string, manual: boolean): Promise<Trabajo> {
  const { db } = deps
  try {
    const r = await trabajar(deps, semana)
    if (r.resultado === "fallida") {
      await terminar(db, semana, { estado: "fallida", motivo_fallo: r.motivo }, deps.ahora())
    } else {
      await terminar(db, semana, { estado: "lista", resumen: { ...r.resumen, manual }, costo_usd: r.costo }, deps.ahora())
    }
    return r
  } catch (causa) {
    await terminar(db, semana, { estado: "fallida", motivo_fallo: MOTIVO_DE_FALLA }, deps.ahora())
    throw causa
  }
}
```

  - Replace `correrMotor` with:

```ts
/**
 * The Sunday run: scores crossings, asks Claude for theories and ideas, validates the backing and fills the bank.
 * One run per week (`motor_corridas.semana` is unique). Turned off in Ajustes › Presupuesto, the Sunday run is skipped
 * before it registers anything; «Proponer ahora» (manual) is Coni asking and always runs. Reaching the limit closes the
 * run as failed without throwing and tells Coni; any other error closes it as failed and propagates so the scheduled
 * task alerts WAV.
 */
export async function correrMotor(
  deps: DepsDelMotor,
  entrada: { semana: string; manual: boolean },
): Promise<ResultadoDelMotor> {
  const { db } = deps
  const { semana, manual } = entrada
  if (!manual && !(await leerInterruptores(db)).motorSemanal) return { resultado: "apagado" }
  const { error } = await db.from("motor_corridas").insert({ semana, estado: "corriendo" })
  if (error?.code === UNIQUE_VIOLATION) {
    if (!(await retomar(deps, semana))) return { resultado: "ya_corrio" }
  } else if (error) throw falloDeBase("No pude registrar la corrida del motor", error)

  const r = await trabajarYCerrar(deps, semana, manual)
  // After the run is closed: a notice that fails propagates (the task alerts WAV) and never reopens the run.
  if (llegoAlLimite(r)) await avisarLimite(deps, deps.ahora())
  return r.resultado === "fallida" ? { resultado: "fallida", motivo: r.motivo } : { resultado: "lista", resumen: r.resumen }
}
```

In `lib/produccion/deps-reales.ts`, in the object `depsMotor` returns, add `avisos: avisosReales(),` after `almacen: almacenReal(),`.

- [ ] **Step 5: Run, expect PASS** — `pnpm type`, `pnpm test:db tests/integration/motor-semanal.test.ts`, `pnpm test:run tests/unit/motor-task.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/presupuesto/interruptores.ts lib/motor/semanal.ts lib/produccion/deps-reales.ts tests/integration/motor-semanal.test.ts
git commit -m "Let Coni switch off the Sunday engine and tell her when the limit stops it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Topic jobs: the notice at the limit and the switch of the nightly merges

**Files:**
- Modify: `lib/mantenimiento/ejecutar.ts`, `lib/mantenimiento/temas.ts` (doc comment)
- Test: `tests/integration/mantenimiento-temas.test.ts`, `tests/unit/mantenimiento-nocturno.test.ts`

- [ ] **Step 1: Write the failing tests.**

In `tests/integration/mantenimiento-temas.test.ts`, inside `describe("maintenance runs")`, add:

```ts
  it("tells Coni when the month's limit stops the topics job, and does not fail the run", async () => {
    await pool.query("delete from public.avisos where clave like 'limite_alcanzado:%'")
    await sinVector(3)
    simularVoyage()
    simularClaude()
    const avisos = notificadorEnMemoria()

    const resultado = await conTopeChico(() =>
      mantenimientoFrecuente({
        ...base(),
        avisos,
        dispararGrabacion: async () => undefined,
        dispararProduccion: async () => undefined,
        dispararArmado: async () => undefined,
        temas: async () => deps(),
      }),
    )

    expect(resultado.temas).toMatchObject({ tope: true })
    expect(avisos.avisosEnviados.map((aviso) => aviso.tipo)).toEqual(["limite_alcanzado"])
  })
```

In `tests/unit/mantenimiento-nocturno.test.ts`:
  - add the mocks (with the others, at the top):

```ts
vi.mock("@/lib/ingesta/temas", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ingesta/temas")>()),
  fusionarTemas: vi.fn(async () => ({ tope: false, fusionados: 0 })),
}))
vi.mock("@/lib/presupuesto/interruptores", () => ({
  leerInterruptores: vi.fn(async () => ({ motorSemanal: true, fusionesNocturnas: true })),
}))
vi.mock("@/lib/presupuesto/limite", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/presupuesto/limite")>()),
  avisarLimite: vi.fn(async () => {}),
}))
```

  - add the imports `import Anthropic from "@anthropic-ai/sdk"`, `import { fusionarTemas } from "@/lib/ingesta/temas"`, `import { leerInterruptores } from "@/lib/presupuesto/interruptores"`, `import { avisarLimite } from "@/lib/presupuesto/limite"` and `import type { DepsMantenimientoTemas } from "@/lib/mantenimiento/temas"`;
  - add after the existing `describe`:

```ts
const TEMAS: DepsMantenimientoTemas = {
  db: DEPS.db,
  almacen: almacenEnMemoria(),
  ahora: DEPS.ahora,
  claude: new Anthropic({ apiKey: "sk-ant-clave-de-prueba", maxRetries: 0 }),
  llaveVoyage: () => undefined,
}

describe("las fusiones nocturnas", () => {
  it("are skipped, as «apagado» and not as a failure, when Coni turned them off", async () => {
    vi.mocked(leerInterruptores).mockResolvedValueOnce({ motorSemanal: true, fusionesNocturnas: false })

    const resultado = await mantenimientoNocturno({ ...DEPS, temas: async () => TEMAS })

    expect(resultado.fusiones).toEqual({ apagado: true })
    expect(fusionarTemas).not.toHaveBeenCalled()
  })

  it("tell Coni when the month's limit stops them", async () => {
    vi.mocked(fusionarTemas).mockResolvedValueOnce({ tope: true, fusionados: 0 })

    const resultado = await mantenimientoNocturno({ ...DEPS, temas: async () => TEMAS })

    expect(resultado.fusiones).toEqual({ tope: true, fusionados: 0 })
    expect(avisarLimite).toHaveBeenCalledWith(expect.objectContaining({ avisos: DEPS.avisos }), DEPS.ahora())
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:db tests/integration/mantenimiento-temas.test.ts -t "limit"` and `pnpm test:run tests/unit/mantenimiento-nocturno.test.ts`.

- [ ] **Step 3: Implement** in `lib/mantenimiento/ejecutar.ts`: add `import { leerInterruptores } from "@/lib/presupuesto/interruptores"` and `import { avisarLimite } from "@/lib/presupuesto/limite"`, add `const APAGADO = { apagado: true } as const` after `OMITIDO`, and replace the `temas` job of `mantenimientoFrecuente` and the `fusiones` job of `mantenimientoNocturno` with:

```ts
    temas: async () => {
      const propias = await deps.temas()
      if (!propias) return OMITIDO
      const resultado = await mantenerTemas(propias)
      // Silent before the hard limit; now Coni hears it once a month (spec 2026-11-02).
      if (resultado.tope) await avisarLimite(deps, deps.ahora())
      return resultado
    },
```

```ts
    fusiones: async () => {
      const propias = await deps.temas()
      if (!propias) return OMITIDO
      // Read only when there is work: Coni can turn the nightly merges off in Ajustes › Presupuesto (D2).
      if (!(await leerInterruptores(deps.db)).fusionesNocturnas) return APAGADO
      const resultado = await fusionarTemas(propias)
      if (resultado.tope) await avisarLimite(deps, deps.ahora())
      return resultado
    },
```

In `lib/mantenimiento/temas.ts` replace the end of the doc comment of `mantenerTemas`, `Reaching the cap returns \`tope: true\` and alerts nobody: the next month's reset is the retry.`, with `Reaching the month's limit returns \`tope: true\`; the maintenance run tells Coni (lib/mantenimiento/ejecutar.ts).`

- [ ] **Step 4: Run, expect PASS** — `pnpm type`, `pnpm test:run tests/unit/mantenimiento-nocturno.test.ts tests/unit/mantenimiento-task.test.ts`, `pnpm test:db tests/integration/mantenimiento-temas.test.ts tests/integration/temas.test.ts tests/integration/barrido-gastos.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/mantenimiento/ejecutar.ts lib/mantenimiento/temas.ts tests/integration/mantenimiento-temas.test.ts tests/unit/mantenimiento-nocturno.test.ts
git commit -m "Tell Coni when the limit stops the topic jobs and let her switch off the nightly merges" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: Settings actions: her limit, the switches, the cap that resets the limit, and Reactivar

**Files:**
- Create: `lib/presupuesto/presentar.ts` (only the stepper limits in this task), `lib/acciones/presupuesto.ts`, `tests/integration/acciones-presupuesto.test.ts`
- Modify: `lib/acciones/ajustes.ts`, `app/(app)/ajustes/acciones.ts`
- Test: `tests/integration/acciones-ajustes.test.ts`

- [ ] **Step 1: Write the failing tests.**

In `tests/integration/acciones-ajustes.test.ts` add `, limite_duro_usd = null, motor_semanal_activo = true, fusiones_nocturnas_activas = true` to the `update public.ajustes set …` of `afterEach` (right after `tope_mensual_usd = 40`), replace the test `"warns when the new cap is under what the month already spent, and still saves it"` with:

```ts
  it("warns when the new cap leaves a limit under what the month already spent, and still saves it", async () => {
    await pool.query(
      "insert into public.gastos (proveedor, paso, mes, estimado_usd, real_usd, estado, clave) values ('heygen', 'prueba_ajustes', date_trunc('month', now() at time zone 'America/Santiago')::date, 10, 12.5, 'confirmado', 'prueba-ajustes-1')",
    )

    const resultado = await guardarAjuste(deps(), { campo: "tope", valor: 5 })

    expect(resultado).toMatchObject({
      ok: true,
      aviso: "Ya gastaste US$ 12,50; con este límite lo nuevo queda en pausa hasta el próximo mes. Lo que ya firmaste sigue.",
    })
    expect(Number((await ajustes()).tope_mensual_usd)).toBe(5)
  })
```

and add, inside `describe("guardarAjuste")`:

```ts
  it("brings the limit back to twice the cap, and says so, when the cap goes above the limit she set", async () => {
    await pool.query("update public.ajustes set limite_duro_usd = 60")

    const resultado = await guardarAjuste(deps(), { campo: "tope", valor: 70 })

    expect(resultado).toMatchObject({ ok: true, aviso: "Tu límite volvió al doble del tope: US$ 140,00" })
    expect(await ajustes()).toMatchObject({ tope_mensual_usd: "70.00", limite_duro_usd: null })
  })

  it("keeps the limit she set when the cap stays under it", async () => {
    await pool.query("update public.ajustes set limite_duro_usd = 100")

    expect(await guardarAjuste(deps(), { campo: "tope", valor: 45 })).toMatchObject({ ok: true })
    expect(await ajustes()).toMatchObject({ tope_mensual_usd: "45.00", limite_duro_usd: "100.00" })
  })

  it("saves her own limit, back to twice the cap with null, and never one under the cap", async () => {
    expect(await guardarAjuste(deps(), { campo: "limite", valor: 90 })).toMatchObject({
      ok: true,
      anterior: { campo: "limite", valor: null },
    })
    expect((await ajustes()).limite_duro_usd).toBe("90.00")

    expect(await guardarAjuste(deps(), { campo: "limite", valor: null })).toMatchObject({ ok: true })
    expect((await ajustes()).limite_duro_usd).toBeNull()

    expect(await guardarAjuste(deps(), { campo: "limite", valor: 30 })).toEqual({
      ok: false,
      error: "Tu límite no puede ser menor que tu tope de US$ 40,00.",
    })
    expect((await ajustes()).limite_duro_usd).toBeNull()
  })

  it("saves the switches of what spends by itself", async () => {
    expect(await guardarAjuste(deps(), { campo: "motor_semanal", valor: false })).toMatchObject({
      ok: true,
      anterior: { campo: "motor_semanal", valor: true },
    })
    expect(await guardarAjuste(deps(), { campo: "fusiones_nocturnas", valor: false })).toMatchObject({ ok: true })
    expect(await ajustes()).toMatchObject({ motor_semanal_activo: false, fusiones_nocturnas_activas: false })
  })
```

Create `tests/integration/acciones-presupuesto.test.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { reactivarLimite } from "@/lib/acciones/presupuesto"
import type { Database } from "@/lib/supabase/database.types"
import { pool } from "./db"
import { clienteDeConi, clienteDelMantenedor } from "./sesion-coni"

let coni: SupabaseClient<Database>
let mantenedor: SupabaseClient<Database>

const MES = "date_trunc('month', now() at time zone 'America/Santiago')::date"

beforeAll(async () => {
  coni = await clienteDeConi()
  mantenedor = await clienteDelMantenedor()
})

afterEach(async () => {
  vi.restoreAllMocks()
  await pool.query("delete from public.limites_del_mes")
  await pool.query("delete from public.gastos where paso = 'prueba_presupuesto'")
})

afterAll(() => pool.end())

async function gastado(usd: number): Promise<void> {
  await pool.query(
    `insert into public.gastos (proveedor, paso, mes, estimado_usd, real_usd, estado, clave) values ('heygen', 'prueba_presupuesto', ${MES}, $1, $1, 'confirmado', 'prueba-presupuesto-1')`,
    [usd],
  )
}

async function limiteGuardado(): Promise<number | null> {
  const { rows } = await pool.query<{ limite: number }>(
    `select limite_usd::float8 as limite from public.limites_del_mes where mes = ${MES}`,
  )
  return rows[0]?.limite ?? null
}

describe("reactivarLimite", () => {
  it("sets this month's limit and answers with it", async () => {
    expect(await reactivarLimite(coni, { limite: 120 })).toEqual({ ok: true, limite: 120 })
    expect(await limiteGuardado()).toBe(120)
  })

  it("explains in plain Spanish a limit that does not cover what she spent, and saves nothing", async () => {
    await gastado(90)

    expect(await reactivarLimite(coni, { limite: 85 })).toEqual({
      ok: false,
      error: "Ese límite no alcanza: ya gastaste US$ 90,00 este mes. Elige uno mayor.",
    })
    expect(await limiteGuardado()).toBeNull()
  })

  it("asks for dollars when what she wrote is not an amount", async () => {
    expect(await reactivarLimite(coni, { limite: -5 })).toEqual({
      ok: false,
      error: "Escribe tu límite en dólares, por ejemplo 120.",
    })
  })

  it("does not let WAV reactivate the month", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    expect(await reactivarLimite(mantenedor, { limite: 120 })).toMatchObject({ ok: false })
    expect(await limiteGuardado()).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:db tests/integration/acciones-ajustes.test.ts tests/integration/acciones-presupuesto.test.ts` (no `limite` field, no switches, no `lib/acciones/presupuesto.ts`).

- [ ] **Step 3: Create `lib/presupuesto/presentar.ts`** with the stepper limits (Task 12 adds the rest of the file):

```ts
/** The most the cap goes in Ajustes › Presupuesto. */
export const MAXIMO_DEL_TOPE_USD = 500
/** Twice the largest cap: the default limit of the largest cap still fits. */
export const MAXIMO_DEL_LIMITE_USD = 2 * MAXIMO_DEL_TOPE_USD
/** Both steppers move in steps of US$ 5. */
export const PASO_DEL_PRESUPUESTO_USD = 5

/** D5: the limit is twice the cap unless Coni sets her own. */
export function limitePorDefecto(tope: number): number {
  return 2 * tope
}
```

- [ ] **Step 4: Implement the settings action** in `lib/acciones/ajustes.ts`:
  - replace `export const MAXIMO_DEL_TOPE_USD = 500` with `import { limitePorDefecto, MAXIMO_DEL_LIMITE_USD, MAXIMO_DEL_TOPE_USD } from "@/lib/presupuesto/presentar"` (with the other imports);
  - add three members to `CambioDeAjuste`, after the `tope` one:

```ts
  z.object({ campo: z.literal("limite"), valor: z.number().min(0).max(MAXIMO_DEL_LIMITE_USD).nullable() }),
  z.object({ campo: z.literal("motor_semanal"), valor: z.boolean() }),
  z.object({ campo: z.literal("fusiones_nocturnas"), valor: z.boolean() }),
```

  - add to `COLUMNAS`, after `tope: "tope_mensual_usd",`:

```ts
  limite: "limite_duro_usd",
  motor_semanal: "motor_semanal_activo",
  fusiones_nocturnas: "fusiones_nocturnas_activas",
```

  - add to the `switch` of `valorActual`, after the `tope` case:

```ts
    case "limite":
      return { campo, valor: fila.limite_duro_usd === null ? null : Number(fila.limite_duro_usd) }
    case "motor_semanal":
      return { campo, valor: fila.motor_semanal_activo }
    case "fusiones_nocturnas":
      return { campo, valor: fila.fusiones_nocturnas_activas }
```

  - in `guardarAjuste`, replace from `const { data: despues, error: errorAlGuardar } = await deps.db` down to the final `return resultado` with:

```ts
    const tope = Number(antes.tope_mensual_usd)
    if (cambio.data.campo === "limite" && cambio.data.valor !== null && cambio.data.valor < tope) {
      throw new Falla(`Tu límite no puede ser menor que tu tope de ${dolares(tope)}.`)
    }
    // D5: a cap above the limit she set brings the limit back to twice the cap, in the same write, so the database
    // check (limite_no_bajo_el_tope) never refuses it.
    const vuelveAlDoble =
      cambio.data.campo === "tope" && antes.limite_duro_usd !== null && cambio.data.valor > antes.limite_duro_usd
    const columnas = vuelveAlDoble ? { ...columnaCon(cambio.data), limite_duro_usd: null } : columnaCon(cambio.data)

    const { data: despues, error: errorAlGuardar } = await deps.db
      .from("ajustes")
      .update(columnas)
      .eq("id", true)
      .select()
      .maybeSingle()
    if (errorAlGuardar)
      throw new Error(`No pude guardar el cambio: ${errorAlGuardar.message}`, { cause: errorAlGuardar })
    // Row level security answers "no rows" to anybody who is not Coni.
    if (!despues) throw new Error("La base no guardó el cambio de ajustes.")

    const resultado: { anterior: CambioDeAjuste; aviso?: string } = { anterior: valorActual(antes, cambio.data.campo) }
    if (cambio.data.campo === "tope" && vuelveAlDoble) {
      resultado.aviso = `Tu límite volvió al doble del tope: ${dolares(limitePorDefecto(cambio.data.valor))}`
    } else if (cambio.data.campo === "tope" || cambio.data.campo === "limite") {
      const presupuesto = await leerPresupuesto(deps.db, Date.parse(deps.ahora()), despues.zona)
      if (presupuesto.usado >= presupuesto.limite) {
        resultado.aviso = `Ya gastaste ${dolares(presupuesto.usado)}; con este límite lo nuevo queda en pausa hasta el próximo mes. Lo que ya firmaste sigue.`
      }
    }
    return resultado
```

- [ ] **Step 5: Create `lib/acciones/presupuesto.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { Falla } from "@/lib/dominio/falla"
import { dolares } from "@/lib/formato"
import { MAXIMO_DEL_LIMITE_USD } from "@/lib/presupuesto/presentar"
import type { Database } from "@/lib/supabase/database.types"
import { aResultado, type Resultado } from "./resultado"

const EntradaDeLimite = z.object({ limite: z.number().positive().max(MAXIMO_DEL_LIMITE_USD) })

/**
 * «Reactivar» in Ajustes › Presupuesto (D4): Coni sets this month's limit through `fijar_limite_del_mes`, which is hers
 * alone and refuses a limit that does not cover what the month already used. Nothing stopped restarts by itself (D7).
 */
export function reactivarLimite(
  db: SupabaseClient<Database>,
  entrada: unknown,
): Promise<Resultado<{ limite: number }>> {
  return aResultado("reactivarLimite", async () => {
    const datos = EntradaDeLimite.safeParse(entrada)
    if (!datos.success) throw new Falla("Escribe tu límite en dólares, por ejemplo 120.")
    const { data, error } = await db.rpc("fijar_limite_del_mes", { p_limite: datos.data.limite })
    if (error) {
      if (error.message === "limite_bajo") {
        const usado = /usado=([0-9.]+)/.exec(error.details ?? "")?.[1]
        throw new Falla(
          usado === undefined
            ? "Ese límite no alcanza para lo que ya gastaste este mes. Elige uno mayor."
            : `Ese límite no alcanza: ya gastaste ${dolares(Number(usado))} este mes. Elige uno mayor.`,
        )
      }
      throw new Error(`No pude reactivar el límite: ${error.message}`, { cause: error })
    }
    return { limite: Number(data.limite_usd) }
  })
}
```

In `app/(app)/ajustes/acciones.ts` add `import { reactivarLimite } from "@/lib/acciones/presupuesto"` and, at the end:

```ts
export async function reactivarLimiteAccion(limite: number) {
  return refrescar(
    await conSesionDeConi("reactivarLimite", z.object({ limite: z.number() }), { limite }, (db, d) =>
      reactivarLimite(db, d),
    ),
  )
}
```

- [ ] **Step 6: Run, expect PASS** — `pnpm type`, `pnpm test:db tests/integration/acciones-ajustes.test.ts tests/integration/acciones-presupuesto.test.ts tests/integration/ajustes.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add lib/presupuesto/presentar.ts lib/acciones/ajustes.ts lib/acciones/presupuesto.ts "app/(app)/ajustes/acciones.ts" tests/integration/acciones-ajustes.test.ts tests/integration/acciones-presupuesto.test.ts
git commit -m "Save her limit and the switches, reset the limit under a higher cap, and reactivate the month" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Reading and wording the month's budget

**Files:**
- Create: `lib/presupuesto/leer.ts`, `tests/unit/presentar-presupuesto.test.ts`, `tests/integration/presupuesto-datos.test.ts`
- Modify: `lib/presupuesto/presentar.ts`

- [ ] **Step 1: Write the failing unit test** (`tests/unit/presentar-presupuesto.test.ts`)

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest"
import { filaDePresupuesto, type PresupuestoDelMes, presentarPresupuesto } from "@/lib/presupuesto/presentar"

const BASE: PresupuestoDelMes = {
  tope: 40,
  limiteExplicito: null,
  limite: 80,
  reactivado: false,
  usado: 12.8,
  porProveedor: { anthropic: 2.5, elevenlabs: 0.3, heygen: 10, voyage: 0 },
  motor: { activo: true, usd: 1.2 },
  fusiones: { activas: false, usd: 0 },
  avisoSinLeer: false,
  margenUsd: 1.1,
}

describe("presentarPresupuesto", () => {
  it("says the month against the cap, in ink, with the four marks in words", () => {
    const vista = presentarPresupuesto(BASE)
    expect(vista.linea).toBe("Llevas US$ 12,80 de tu tope de US$ 40,00 este mes")
    expect(vista.tono).toBe("tinta")
    expect(vista.escala).toBe(80)
    expect(vista.relleno).toBe(16)
    expect(vista.marcas).toEqual([
      { etiqueta: "50 % del tope", monto: "US$ 20,00", porcentaje: 25 },
      { etiqueta: "80 % del tope", monto: "US$ 32,00", porcentaje: 40 },
      { etiqueta: "Tope", monto: "US$ 40,00", porcentaje: 50 },
      { etiqueta: "Límite", monto: "US$ 80,00", porcentaje: 100 },
    ])
    expect(vista.pasado).toBeNull()
    expect(vista.etiquetaDelLimite).toBe("US$ 80 (el doble del tope)")
    expect(vista.enElLimite).toBe(false)
  })

  it("warns from 80 percent of the cap", () => {
    expect(presentarPresupuesto({ ...BASE, usado: 32 }).tono).toBe("aviso")
  })

  it("says the app goes on past the cap, up to the limit", () => {
    const vista = presentarPresupuesto({ ...BASE, usado: 45 })
    expect(vista.tono).toBe("pasado")
    expect(vista.pasado).toBe("Pasaste tu tope. La app sigue hasta tu límite de US$ 80,00.")
  })

  it("is at the limit when not even one more script fits, and proposes the limit plus the cap", () => {
    const vista = presentarPresupuesto({ ...BASE, usado: 79 })
    expect(vista.enElLimite).toBe(true)
    expect(vista.textoEnElLimite).toBe(
      "Llegaste a tu límite de US$ 80,00. Lo nuevo quedó en pausa; lo que ya firmaste sigue.",
    )
    expect(vista.propuestaDeReactivar).toBe(120)
  })

  it("is at the limit while the month's limit notice is unread", () => {
    expect(presentarPresupuesto({ ...BASE, usado: 50, avisoSinLeer: true }).enElLimite).toBe(true)
  })

  it("names her own limit without the default's words, and a reactivated month", () => {
    expect(presentarPresupuesto({ ...BASE, limiteExplicito: 100, limite: 100 }).etiquetaDelLimite).toBe("US$ 100")
    expect(presentarPresupuesto({ ...BASE, reactivado: true, limite: 130 }).reactivado).toBe(
      "Este mes tu límite es US$ 130,00 porque lo reactivaste.",
    )
    expect(presentarPresupuesto(BASE).reactivado).toBeNull()
  })

  it("stretches the bar to what was spent when it passed the limit", () => {
    const vista = presentarPresupuesto({ ...BASE, usado: 90 })
    expect(vista.escala).toBe(90)
    expect(vista.relleno).toBe(100)
  })

  it("lists every provider, in a fixed order, even at zero", () => {
    expect(presentarPresupuesto(BASE).porProveedor).toEqual([
      { nombre: "Claude", monto: "US$ 2,50" },
      { nombre: "ElevenLabs", monto: "US$ 0,30" },
      { nombre: "HeyGen", monto: "US$ 10,00" },
      { nombre: "Voyage", monto: "US$ 0,00" },
    ])
  })
})

describe("filaDePresupuesto", () => {
  it("is the short line of the Ajustes row, in whole dollars", () => {
    expect(filaDePresupuesto(31.6, 40)).toBe("Presupuesto · US$ 32 de 40")
  })
})
```

- [ ] **Step 2: Write the failing integration test** (`tests/integration/presupuesto-datos.test.ts`)

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { leerPresupuestoDelMes } from "@/lib/presupuesto/leer"
import { claveDelAvisoDeLimite, mesDelGasto } from "@/lib/presupuesto/limite"
import { ESTIMADO_POR_GUION_USD } from "@/lib/produccion/comun"
import type { Database } from "@/lib/supabase/database.types"
import { CONI, pool } from "./db"
import { clienteDeConi } from "./sesion-coni"

let coni: SupabaseClient<Database>
const MES = "date_trunc('month', now() at time zone 'America/Santiago')::date"

async function gasto(proveedor: string, paso: string, clave: string, estado: string, usd: number): Promise<void> {
  await pool.query(
    `insert into public.gastos (proveedor, paso, mes, estimado_usd, real_usd, estado, clave) values ($1, $2, ${MES}, $5, case when $4 = 'confirmado' then $5::numeric end, $4, $3)`,
    [proveedor, paso, clave, estado, usd],
  )
}

async function limpiar(): Promise<void> {
  await pool.query("delete from public.gastos")
  await pool.query("delete from public.limites_del_mes")
  await pool.query("delete from public.avisos where clave like 'limite_alcanzado:%'")
}

beforeAll(async () => {
  coni = await clienteDeConi()
})
beforeEach(limpiar)
afterAll(async () => {
  await limpiar()
  await pool.end()
})

describe("leerPresupuestoDelMes", () => {
  it("reads the cap, the limit, the spend by provider and what spends by itself", async () => {
    await gasto("anthropic", "motor", "prueba-datos-motor", "confirmado", 1.25)
    await gasto("anthropic", "temas", "temas:fusionar:prueba-datos", "confirmado", 0.25)
    await gasto("heygen", "grabar", "prueba-datos-heygen", "reservado", 2)
    await gasto("elevenlabs", "voz", "prueba-datos-liberado", "liberado", 5)

    expect(await leerPresupuestoDelMes(coni, Date.now())).toEqual({
      tope: 40,
      limiteExplicito: null,
      limite: 80,
      reactivado: false,
      usado: 3.5,
      porProveedor: { anthropic: 1.5, elevenlabs: 0, heygen: 2, voyage: 0 },
      motor: { activo: true, usd: 1.25 },
      fusiones: { activas: true, usd: 0.25 },
      avisoSinLeer: false,
      margenUsd: ESTIMADO_POR_GUION_USD,
    })
  })

  it("knows a reactivated month and an unread limit notice", async () => {
    await pool.query(`insert into public.limites_del_mes (mes, limite_usd, fijado_por) values (${MES}, 130, $1)`, [
      CONI,
    ])
    await pool.query(
      "insert into public.avisos (tipo, clave, mensaje) values ('limite_alcanzado', $1, 'Llegaste a tu límite.')",
      [claveDelAvisoDeLimite(mesDelGasto(new Date().toISOString()))],
    )

    expect(await leerPresupuestoDelMes(coni, Date.now())).toMatchObject({
      limite: 130,
      reactivado: true,
      avisoSinLeer: true,
    })
  })
})
```

- [ ] **Step 3: Run both, expect FAIL** — `pnpm test:run tests/unit/presentar-presupuesto.test.ts` and `pnpm test:db tests/integration/presupuesto-datos.test.ts`.

- [ ] **Step 4: Complete `lib/presupuesto/presentar.ts`.** It must stay free of server imports: the client screen imports it. Add to the file of Task 11:

```ts
import { dolares } from "@/lib/formato"

export const PROVEEDORES = ["anthropic", "elevenlabs", "heygen", "voyage"] as const
export type Proveedor = (typeof PROVEEDORES)[number]

export function esProveedor(valor: string): valor is Proveedor {
  return (PROVEEDORES as readonly string[]).includes(valor)
}

/** The month as Ajustes › Presupuesto shows it (read by lib/presupuesto/leer.ts). */
export interface PresupuestoDelMes {
  tope: number
  /** Her limit for every month, or null for twice the cap. */
  limiteExplicito: number | null
  /** This month's brake (`limite_del_mes`). */
  limite: number
  /** True when she reactivated this month: its row wins over `limiteExplicito`. */
  reactivado: boolean
  usado: number
  porProveedor: Record<Proveedor, number>
  motor: { activo: boolean; usd: number }
  fusiones: { activas: boolean; usd: number }
  avisoSinLeer: boolean
  /** What one more script holds (`ESTIMADO_POR_GUION_USD`): without that room, new work is paused. */
  margenUsd: number
}

export interface Marca {
  etiqueta: string
  monto: string
  /** Where the tick goes on the bar, 0 to 100. */
  porcentaje: number
}

export interface VistaDelPresupuesto {
  linea: string
  usado: number
  /** The bar's full length in dollars: the limit, or the spend when it passed the limit. */
  escala: number
  relleno: number
  tono: "tinta" | "aviso" | "pasado"
  marcas: Marca[]
  pasado: string | null
  etiquetaDelLimite: string
  enElLimite: boolean
  textoEnElLimite: string
  propuestaDeReactivar: number
  reactivado: string | null
  porProveedor: { nombre: string; monto: string }[]
}

const NOMBRES: Record<Proveedor, string> = {
  anthropic: "Claude",
  elevenlabs: "ElevenLabs",
  heygen: "HeyGen",
  voyage: "Voyage",
}

const dosDecimales = (valor: number) => Math.round(valor * 100) / 100

/**
 * Spec 2026-11-02, Screens: the bar against the cap with marks at 50, 80 and 100 percent of the cap and at the limit;
 * ink below 80 percent, the warning icon from 80 percent, the error fill past the cap (the raspberry is for signing).
 */
export function presentarPresupuesto(p: PresupuestoDelMes): VistaDelPresupuesto {
  const escala = Math.max(p.limite, p.tope, p.usado)
  const parte = (usd: number) => (escala > 0 ? dosDecimales(Math.min(100, (usd / escala) * 100)) : 0)
  const marca = (etiqueta: string, usd: number): Marca => ({ etiqueta, monto: dolares(usd), porcentaje: parte(usd) })
  const tono = p.usado > p.tope ? "pasado" : p.tope > 0 && p.usado >= 0.8 * p.tope ? "aviso" : "tinta"
  return {
    linea: `Llevas ${dolares(p.usado)} de tu tope de ${dolares(p.tope)} este mes`,
    usado: p.usado,
    escala,
    relleno: parte(p.usado),
    tono,
    marcas: [
      marca("50 % del tope", 0.5 * p.tope),
      marca("80 % del tope", 0.8 * p.tope),
      marca("Tope", p.tope),
      marca("Límite", p.limite),
    ],
    pasado: p.usado > p.tope ? `Pasaste tu tope. La app sigue hasta tu límite de ${dolares(p.limite)}.` : null,
    etiquetaDelLimite:
      p.limiteExplicito === null ? `US$ ${limitePorDefecto(p.tope)} (el doble del tope)` : `US$ ${p.limiteExplicito}`,
    enElLimite: p.usado + p.margenUsd > p.limite || p.avisoSinLeer,
    textoEnElLimite: `Llegaste a tu límite de ${dolares(p.limite)}. Lo nuevo quedó en pausa; lo que ya firmaste sigue.`,
    propuestaDeReactivar: p.limite + p.tope,
    reactivado: p.reactivado ? `Este mes tu límite es ${dolares(p.limite)} porque lo reactivaste.` : null,
    porProveedor: PROVEEDORES.map((proveedor) => ({
      nombre: NOMBRES[proveedor],
      monto: dolares(p.porProveedor[proveedor]),
    })),
  }
}

/** The row of Ajustes: «Presupuesto · US$ 32 de 40». */
export function filaDePresupuesto(usado: number, tope: number): string {
  return `Presupuesto · US$ ${Math.round(usado)} de ${Math.round(tope)}`
}
```

(Put the `import` line at the top of the file, above the constants of Task 11.)

- [ ] **Step 5: Create `lib/presupuesto/leer.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js"
import { limiteDelMes } from "@/lib/datos/repositorio"
import { ESTIMADO_POR_GUION_USD } from "@/lib/produccion/comun"
import type { Database } from "@/lib/supabase/database.types"
import { claveDelAvisoDeLimite, mesDelGasto } from "./limite"
import { esProveedor, type PresupuestoDelMes, type Proveedor } from "./presentar"

type Db = SupabaseClient<Database>

function fallo(contexto: string, error: { message: string }): Error {
  return new Error(`${contexto}: ${error.message}`, { cause: error })
}

/** Reserved money counts at its estimate and confirmed money at its real cost, as `reservar_gasto` counts them. */
function montoDe(gasto: { estado: string; estimado_usd: number; real_usd: number | null }): number {
  return gasto.estado === "confirmado" ? (gasto.real_usd ?? gasto.estimado_usd) : gasto.estimado_usd
}

/**
 * Ajustes › Presupuesto, read through Coni's session (every table here is hers to read), for the Santiago month of
 * `ahora`. The engine's spend is its `motor` step; the nightly merges are the `temas:fusionar:` reservations.
 */
export async function leerPresupuestoDelMes(db: Db, ahora: number): Promise<PresupuestoDelMes> {
  const instante = new Date(ahora).toISOString()
  const mes = mesDelGasto(instante)
  const primerDia = `${mes}-01`
  const [ajustes, gastos, filaDelMes, aviso, limite] = await Promise.all([
    db
      .from("ajustes")
      .select("tope_mensual_usd, limite_duro_usd, motor_semanal_activo, fusiones_nocturnas_activas")
      .maybeSingle(),
    db
      .from("gastos")
      .select("proveedor, paso, clave, estado, estimado_usd, real_usd")
      .eq("mes", primerDia)
      .in("estado", ["reservado", "confirmado"]),
    db.from("limites_del_mes").select("mes").eq("mes", primerDia).maybeSingle(),
    db.from("avisos").select("id").eq("clave", claveDelAvisoDeLimite(mes)).is("leido_en", null).maybeSingle(),
    limiteDelMes(db, instante),
  ])
  if (ajustes.error) throw fallo("No pude leer los ajustes del presupuesto", ajustes.error)
  if (!ajustes.data) throw new Error("Falta la fila de ajustes.")
  if (gastos.error) throw fallo("No pude leer los gastos del mes", gastos.error)
  if (filaDelMes.error) throw fallo("No pude leer el límite del mes", filaDelMes.error)
  if (aviso.error) throw fallo("No pude leer el aviso del límite", aviso.error)

  const porProveedor: Record<Proveedor, number> = { anthropic: 0, elevenlabs: 0, heygen: 0, voyage: 0 }
  let usado = 0
  let motor = 0
  let fusiones = 0
  for (const gasto of gastos.data) {
    const monto = montoDe(gasto)
    usado += monto
    if (esProveedor(gasto.proveedor)) porProveedor[gasto.proveedor] += monto
    if (gasto.paso === "motor") motor += monto
    if (gasto.clave.startsWith("temas:fusionar:")) fusiones += monto
  }
  return {
    tope: ajustes.data.tope_mensual_usd,
    limiteExplicito: ajustes.data.limite_duro_usd,
    limite,
    reactivado: filaDelMes.data !== null,
    usado,
    porProveedor,
    motor: { activo: ajustes.data.motor_semanal_activo, usd: motor },
    fusiones: { activas: ajustes.data.fusiones_nocturnas_activas, usd: fusiones },
    avisoSinLeer: aviso.data !== null,
    margenUsd: ESTIMADO_POR_GUION_USD,
  }
}
```

- [ ] **Step 6: Run, expect PASS** — `pnpm type`, `pnpm test:run tests/unit/presentar-presupuesto.test.ts`, `pnpm test:db tests/integration/presupuesto-datos.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add lib/presupuesto/presentar.ts lib/presupuesto/leer.ts tests/unit/presentar-presupuesto.test.ts tests/integration/presupuesto-datos.test.ts
git commit -m "Read and word the month's budget: bar, marks, limit, providers and self-running spend" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Gate 1 and the video screen count against the limit

**Files:**
- Modify: `lib/datos/grabacion.ts`, `lib/datos/pantallas.ts` (`leerCostoDeGrabar`)
- Test: `tests/unit/grabacion.test.ts`, `tests/integration/grabacion-datos.test.ts`, `tests/integration/costo-de-grabar.test.ts`

At gate 1 the voice buttons are new spend (P4): they still close when the month's limit cannot cover the voice, now with `TEXTO_LIMITE` and against `limite - usado`. The signature starts the recording, which is signed work, so the month's limit no longer closes it (only the HeyGen balance can).

- [ ] **Step 1: Move the tests to the new rule.**

In `tests/unit/grabacion.test.ts` add `import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"`, delete the import `import { estimarCostoVideo } from "@/lib/produccion/grabar"`, and replace the whole `describe("presentarGrabacion y el tope del mes", …)` block with:

```ts
describe("presentarGrabacion y el límite del mes", () => {
  const entrada = (quedanUsd: number) => ({ ...ENTRADA, quedanUsd })

  it("closes the voice, with the plain line, when the month's limit cannot cover it: it is new spend", () => {
    expect(presentarGrabacion(entrada(0)).bloqueoVoz).toBe(TEXTO_LIMITE)
  })

  it("lets the voice through when it fits what is left of the limit", () => {
    expect(presentarGrabacion(entrada(estimarCostoVoz(GUION) + 0.0001)).bloqueoVoz).toBeNull()
  })

  it("never closes the signature for the month: the recording it starts is signed work", () => {
    expect(presentarGrabacion(entrada(0)).bloqueoVideo).toBeNull()
  })
})
```

(`ENTRADA` keeps its `quedanUsd: 37`: the field now means what is left of the limit.)

In `tests/integration/grabacion-datos.test.ts` add `import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"`, add `, limite_duro_usd = null` after `tope_mensual_usd = 40` in both `update public.ajustes` statements of `beforeEach` and `afterEach`, and replace the test `"blocks both buttons with the cap line when the month has no room left"` with:

```ts
  it("closes the voice with the limit line, and never the signature, when the month has no room left", async () => {
    await pool.query("update public.ajustes set tope_mensual_usd = 0")
    const id = await piezaPorFirmar()

    const datos = await leerDatosDeGrabacion(coni, {
      fila: await leerFila(id),
      estado: "guion_por_aprobar",
      guion: GUION,
      zona: ZONA,
    })

    expect(datos.botones?.bloqueoVoz).toBe(TEXTO_LIMITE)
    expect(datos.botones?.bloqueoVideo).toBeNull()
  })
```

In `tests/integration/costo-de-grabar.test.ts` add `, limite_duro_usd = null` after `tope_mensual_usd = 40` in both `update` statements of `beforeEach` and `afterEach`, replace the helper `topeQueCubreSoloElVideo` with:

```ts
async function limiteQueCubreSoloElVideo(): Promise<{ video: number; voz: number }> {
  const video = estimarCostoVideo(GUION, coniConfig.heygen.motor)
  const voz = estimarCostoVoz(GUION)
  const { usado } = await leerPresupuesto(coni, AHORA, ZONA)
  const limite = usado + video + voz / 2
  await pool.query("update public.ajustes set tope_mensual_usd = $1, limite_duro_usd = $1", [limite])
  return { video, voz }
}
```

rename its three calls to `limiteQueCubreSoloElVideo()`, rename the test `"warns that it passes the cap when the video fits but video plus voice does not"` to `"warns that it passes the limit when the video fits but video plus voice does not"` and `"does not add the voice when the piece already has its audio, and then it fits the cap"` to `"does not add the voice when the piece already has its audio, and then it fits the limit"`, and replace `.superaElTope` with `.superaElLimite` in both.

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/grabacion.test.ts` and `pnpm test:db tests/integration/grabacion-datos.test.ts tests/integration/costo-de-grabar.test.ts` (old line, the signature still closes, `superaElLimite` does not exist, the room is measured against the cap).

- [ ] **Step 3: Implement.** In `lib/datos/grabacion.ts`:
  - delete `const TEXTO_SIN_TOPE = …` and add `import { TEXTO_LIMITE } from "@/lib/presupuesto/limite"`;
  - in `presentarGrabacion` replace the comment of `quedanUsd` with `/** What is left of the month's limit (\`limite - usado\`). */`, replace `const sinTope = (costo: number) => (entrada.quedanUsd < costo ? TEXTO_SIN_TOPE : null)` with `const sinLimite = (costo: number) => (entrada.quedanUsd < costo ? TEXTO_LIMITE : null)`, and return:

```ts
  return {
    montoVoz: costoVozPartido.monto,
    unidadVoz: costoVozPartido.unidad,
    saldoVoz: lineaDeSaldoVoz(saldos.elevenlabs, entrada.zona),
    // At gate 1 her voice is not signed yet: new spend, stopped by the month's limit (spec 2026-11-02, D1).
    bloqueoVoz: sinLimite(usdVoz) ?? bloqueo(alcanceDeVoz(saldos.elevenlabs, textoDeVoz.length)),
    // The signature starts the recording, which is signed work: only the HeyGen balance can close it.
    bloqueoVideo: bloqueo(
      alcanceDeVideo(saldos.heygen, { usd: usdVideo, creditos: estimarCreditosVideo(guion, motor) }),
    ),
  }
```

  - in `leerDatosDeGrabacion` replace `quedanUsd: presupuesto.tope - presupuesto.usado,` with `quedanUsd: presupuesto.limite - presupuesto.usado,`.

In `lib/datos/pantallas.ts` replace `superaElTope` with `superaElLimite` in `CostoDeGrabar` (doc: `True when this recording would take the month past its limit.`) and finish `leerCostoDeGrabar` with:

```ts
  const { limite, usado } = await leerPresupuesto(db, ahora, zona)
  const quedan = Math.max(0, limite - usado)
  return {
    linea: `Grabar cuesta unos ${dolares(estimadoUsd)} · te quedan ${dolares(quedan)} este mes`,
    estimadoUsd,
    superaElLimite: estimadoUsd > quedan,
  }
```

(and `superaElLimite: false` in its early `return` for an unreadable setup).

- [ ] **Step 4: Run, expect PASS** — `pnpm type`, `pnpm test:run tests/unit/grabacion.test.ts tests/unit/pantalla-guion.test.tsx tests/unit/voz-para-firmar.test.tsx`, `pnpm test:db tests/integration/grabacion-datos.test.ts tests/integration/costo-de-grabar.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/datos/grabacion.ts lib/datos/pantallas.ts tests/unit/grabacion.test.ts tests/integration/grabacion-datos.test.ts tests/integration/costo-de-grabar.test.ts
git commit -m "Measure gate 1 and the video's cost line against the month's limit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Ajustes › Presupuesto

**Files:**
- Create: `app/(app)/ajustes/presupuesto/page.tsx`, `app/(app)/ajustes/presupuesto/pantalla-de-presupuesto.tsx`, `tests/unit/pantalla-de-presupuesto.test.tsx`

- [ ] **Step 1: Write the failing test** (`tests/unit/pantalla-de-presupuesto.test.tsx`)

```tsx
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  type AccionesDelPresupuesto,
  PantallaDePresupuesto,
} from "@/app/(app)/ajustes/presupuesto/pantalla-de-presupuesto"
import type { CambioDeAjuste } from "@/lib/acciones/ajustes"
import type { PresupuestoDelMes } from "@/lib/presupuesto/presentar"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const INICIAL: PresupuestoDelMes = {
  tope: 40,
  limiteExplicito: null,
  limite: 80,
  reactivado: false,
  usado: 12.8,
  porProveedor: { anthropic: 2.5, elevenlabs: 0.3, heygen: 10, voyage: 0 },
  motor: { activo: true, usd: 1.2 },
  fusiones: { activas: true, usd: 0.4 },
  avisoSinLeer: false,
  margenUsd: 1.1,
}

const ANTERIOR = { campo: "tope", valor: 40 } as CambioDeAjuste

function acciones(cambios: Partial<AccionesDelPresupuesto> = {}): AccionesDelPresupuesto {
  return {
    guardar: vi.fn(async (_cambio: CambioDeAjuste) => ({ ok: true as const, anterior: ANTERIOR })),
    reactivar: vi.fn(async (limite: number) => ({ ok: true as const, limite })),
    ...cambios,
  }
}

function mostrar(inicial: Partial<PresupuestoDelMes> = {}, cambios: Partial<AccionesDelPresupuesto> = {}) {
  const a = acciones(cambios)
  render(<PantallaDePresupuesto inicial={{ ...INICIAL, ...inicial }} acciones={a} />)
  return a
}

const esperarElGuardado = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(800)
  })

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))
afterEach(() => vi.useRealTimers())

describe("PantallaDePresupuesto", () => {
  it("shows the month against the cap, its marks in words, the cap and the limit", () => {
    mostrar()

    expect(screen.getByRole("meter", { name: "Gasto del mes" })).toHaveAttribute(
      "aria-valuetext",
      "Llevas US$ 12,80 de tu tope de US$ 40,00 este mes",
    )
    expect(screen.getByText("50 % del tope: US$ 20,00")).toBeInTheDocument()
    expect(screen.getByText("Límite: US$ 80,00")).toBeInTheDocument()
    expect(screen.getByText("US$ 40")).toBeInTheDocument()
    expect(screen.getByText("US$ 80 (el doble del tope)")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Reactivar" })).toBeNull()
  })

  it("says past the cap that the app goes on up to the limit", () => {
    mostrar({ usado: 45 })
    expect(screen.getByText("Pasaste tu tope. La app sigue hasta tu límite de US$ 80,00.")).toBeInTheDocument()
  })

  it("moves the cap in steps of 5 and saves once, after she stops tapping", async () => {
    const a = mostrar()

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    expect(screen.getByText("US$ 50")).toBeInTheDocument()
    expect(screen.getByText("US$ 100 (el doble del tope)")).toBeInTheDocument()
    expect(a.guardar).not.toHaveBeenCalled()

    await esperarElGuardado()

    expect(a.guardar).toHaveBeenCalledTimes(1)
    expect(a.guardar).toHaveBeenCalledWith({ campo: "tope", valor: 50 })
  })

  it("brings the limit back to twice the cap on screen when the cap goes above the limit she set", () => {
    mostrar({ limiteExplicito: 45, limite: 45 })

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))

    expect(screen.getByText("US$ 100 (el doble del tope)")).toBeInTheDocument()
  })

  it("stores a limit stepped back to twice the cap as no limit of her own", async () => {
    const a = mostrar({ limiteExplicito: 75, limite: 75 })

    fireEvent.click(screen.getByRole("button", { name: "Subir el límite" }))
    await esperarElGuardado()

    expect(a.guardar).toHaveBeenCalledWith({ campo: "limite", valor: null })
  })

  it("never offers a limit under the cap", () => {
    mostrar({ limiteExplicito: 40, limite: 40 })
    expect(screen.getByRole("button", { name: "Bajar el límite" })).toHaveAttribute("aria-disabled", "true")
  })

  it("shows the server's warning after a save", async () => {
    mostrar(
      {},
      {
        guardar: vi.fn(async () => ({
          ok: true as const,
          anterior: ANTERIOR,
          aviso: "Tu límite volvió al doble del tope: US$ 100,00",
        })),
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "Subir el tope" }))
    await esperarElGuardado()

    expect(await screen.findByText("Tu límite volvió al doble del tope: US$ 100,00")).toBeInTheDocument()
  })

  it("at the limit offers Reactivar, prefilled with the limit plus the cap, with one confirmation", async () => {
    const a = mostrar({ usado: 79 })

    expect(
      screen.getByText("Llegaste a tu límite de US$ 80,00. Lo nuevo quedó en pausa; lo que ya firmaste sigue."),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Reactivar" }))
    expect(screen.getByLabelText("Tu límite de este mes")).toHaveValue(120)
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))

    await waitFor(() => expect(a.reactivar).toHaveBeenCalledWith(120))
    expect(await screen.findByText("Listo: tu límite de este mes es US$ 120,00.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Reactivar" })).toBeNull()
    expect(screen.getByText("Este mes tu límite es US$ 120,00 porque lo reactivaste.")).toBeInTheDocument()
  })

  it("explains a refusal in plain Spanish and keeps what she wrote", async () => {
    mostrar(
      { usado: 79 },
      {
        reactivar: vi.fn(async () => ({
          ok: false as const,
          error: "Ese límite no alcanza: ya gastaste US$ 79,00 este mes. Elige uno mayor.",
        })),
      },
    )

    fireEvent.click(screen.getByRole("button", { name: "Reactivar" }))
    fireEvent.change(screen.getByLabelText("Tu límite de este mes"), { target: { value: "70" } })
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))

    expect(
      await screen.findByText("Ese límite no alcanza: ya gastaste US$ 79,00 este mes. Elige uno mayor."),
    ).toBeInTheDocument()
    expect(screen.getByLabelText("Tu límite de este mes")).toHaveValue(70)
  })

  it("lists this month by provider", () => {
    mostrar()
    const lista = screen.getByRole("list", { name: "Gasto por proveedor" })
    expect(within(lista).getAllByRole("listitem").map((fila) => fila.textContent)).toEqual([
      "ClaudeUS$ 2,50",
      "ElevenLabsUS$ 0,30",
      "HeyGenUS$ 10,00",
      "VoyageUS$ 0,00",
    ])
  })

  it("switches off what spends by itself, with this month's spend beside each", async () => {
    const a = mostrar()

    expect(screen.getByText("US$ 1,20 este mes")).toBeInTheDocument()
    expect(screen.getByText("US$ 0,40 este mes")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("switch", { name: "Ideas nuevas cada domingo" }))
    await waitFor(() => expect(a.guardar).toHaveBeenCalledWith({ campo: "motor_semanal", valor: false }))
    fireEvent.click(screen.getByRole("switch", { name: "Unir temas parecidos cada noche" }))
    await waitFor(() => expect(a.guardar).toHaveBeenLastCalledWith({ campo: "fusiones_nocturnas", valor: false }))
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/pantalla-de-presupuesto.test.tsx` (no component).

- [ ] **Step 3: The screen** (`app/(app)/ajustes/presupuesto/pantalla-de-presupuesto.tsx`)

```tsx
"use client"

import { Minus, Plus, Warning } from "@phosphor-icons/react"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { Seccion } from "@/components/seccion"
import { Aviso } from "@/components/ui/aviso"
import { Bloque } from "@/components/ui/bloque"
import { Boton } from "@/components/ui/boton"
import { FilaConInterruptor } from "@/components/ui/filas"
import { Grupo } from "@/components/ui/grupo"
import { ICONO } from "@/components/ui/icono"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { useAccion } from "@/components/use-accion"
import type { CambioDeAjuste } from "@/lib/acciones/ajustes"
import type { Resultado } from "@/lib/acciones/resultado"
import { dolares } from "@/lib/formato"
import {
  limitePorDefecto,
  MAXIMO_DEL_LIMITE_USD,
  MAXIMO_DEL_TOPE_USD,
  PASO_DEL_PRESUPUESTO_USD,
  type PresupuestoDelMes,
  presentarPresupuesto,
  type VistaDelPresupuesto,
} from "@/lib/presupuesto/presentar"
import { cn } from "@/lib/utils"

export interface AccionesDelPresupuesto {
  guardar: (cambio: CambioDeAjuste) => Promise<Resultado<{ anterior: CambioDeAjuste; aviso?: string }>>
  reactivar: (limite: number) => Promise<Resultado<{ limite: number }>>
}

// She taps a stepper a few times: one save and one line in the log, once she stops.
const ESPERA_DEL_PASO_MS = 600

type CampoConPaso = "tope" | "limite"

/** Spec 2026-11-02, Screens: the month's bar, the cap and the limit, Reactivar, spend by provider and the switches. */
export function PantallaDePresupuesto({
  inicial,
  acciones,
}: {
  inicial: PresupuestoDelMes
  acciones: AccionesDelPresupuesto
}) {
  const [estado, setEstado] = useState(inicial)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, empezar] = useTransition()
  const reactivacion = useAccion()
  const [reactivando, setReactivando] = useState(false)
  const [nuevoLimite, setNuevoLimite] = useState("")
  const cerrarMensaje = useCallback(() => setMensaje(null), [])

  // The latest state, for the timers that save later; and what the screen showed before each run of taps.
  const ultimo = useRef(estado)
  ultimo.current = estado
  const temporizadores = useRef<Partial<Record<CampoConPaso, ReturnType<typeof setTimeout>>>>({})
  const antesDeTocar = useRef<Partial<Record<CampoConPaso, PresupuestoDelMes>>>({})

  useEffect(() => {
    const pendientes = temporizadores.current
    return () => {
      for (const temporizador of Object.values(pendientes)) clearTimeout(temporizador)
    }
  }, [])

  const vista = presentarPresupuesto(estado)

  function poner(siguiente: PresupuestoDelMes) {
    ultimo.current = siguiente
    setEstado(siguiente)
  }

  function guardar(cambio: CambioDeAjuste, antes: PresupuestoDelMes) {
    setError(null)
    empezar(async () => {
      const resultado = await acciones.guardar(cambio)
      if (!resultado.ok) {
        poner(antes)
        setError(resultado.error)
        return
      }
      setMensaje(resultado.aviso ?? "Guardado")
    })
  }

  function programar(campo: CampoConPaso, siguiente: PresupuestoDelMes, cambio: () => CambioDeAjuste) {
    antesDeTocar.current[campo] ??= ultimo.current
    setError(null)
    poner(siguiente)
    const previo = temporizadores.current[campo]
    if (previo) clearTimeout(previo)
    temporizadores.current[campo] = setTimeout(() => {
      const antes = antesDeTocar.current[campo] ?? ultimo.current
      delete antesDeTocar.current[campo]
      guardar(cambio(), antes)
    }, ESPERA_DEL_PASO_MS)
  }

  function moverTope(delta: number) {
    const actual = ultimo.current
    const tope = Math.min(MAXIMO_DEL_TOPE_USD, Math.max(0, actual.tope + delta))
    // The same rule as guardarAjuste: a cap above the limit she set brings the limit back to twice the cap.
    const limiteExplicito =
      actual.limiteExplicito !== null && tope > actual.limiteExplicito ? null : actual.limiteExplicito
    const limite = actual.reactivado ? actual.limite : (limiteExplicito ?? limitePorDefecto(tope))
    programar("tope", { ...actual, tope, limiteExplicito, limite }, () => ({
      campo: "tope",
      valor: ultimo.current.tope,
    }))
  }

  function moverLimite(delta: number) {
    const actual = ultimo.current
    const defecto = limitePorDefecto(actual.tope)
    const valor = Math.min(MAXIMO_DEL_LIMITE_USD, Math.max(actual.tope, (actual.limiteExplicito ?? defecto) + delta))
    // Back at twice the cap it is no limit of her own: it follows the cap again.
    const limiteExplicito = valor === defecto ? null : valor
    const limite = actual.reactivado ? actual.limite : valor
    programar("limite", { ...actual, limiteExplicito, limite }, () => ({
      campo: "limite",
      valor: ultimo.current.limiteExplicito,
    }))
  }

  function alternar(campo: "motor_semanal" | "fusiones_nocturnas", valor: boolean) {
    const antes = ultimo.current
    poner(
      campo === "motor_semanal"
        ? { ...antes, motor: { ...antes.motor, activo: valor } }
        : { ...antes, fusiones: { ...antes.fusiones, activas: valor } },
    )
    guardar({ campo, valor }, antes)
  }

  function abrirReactivar() {
    setNuevoLimite(String(vista.propuestaDeReactivar))
    reactivacion.limpiarError()
    setReactivando(true)
  }

  function confirmarReactivar() {
    const limite = Number(nuevoLimite.replace(",", "."))
    reactivacion.ejecutar(
      () => acciones.reactivar(limite),
      (resultado) => {
        poner({ ...ultimo.current, limite: resultado.limite, reactivado: true, avisoSinLeer: false })
        setReactivando(false)
        setMensaje(`Listo: tu límite de este mes es ${dolares(resultado.limite)}.`)
      },
    )
  }

  const limiteEnPasos = estado.limiteExplicito ?? limitePorDefecto(estado.tope)

  return (
    <div>
      <Seccion titulo="Este mes" id="presupuesto-mes">
        <BarraDelMes vista={vista} />
        {vista.reactivado ? <p className="text-meta text-apagado">{vista.reactivado}</p> : null}
        {vista.enElLimite ? (
          <Bloque tipo="aviso" titulo={vista.textoEnElLimite}>
            {reactivando ? (
              <form
                className="mt-3 grid gap-3"
                onSubmit={(evento) => {
                  evento.preventDefault()
                  confirmarReactivar()
                }}
              >
                <label htmlFor="limite-del-mes" className="text-meta font-semibold">
                  Tu límite de este mes
                </label>
                <input
                  id="limite-del-mes"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step={PASO_DEL_PRESUPUESTO_USD}
                  value={nuevoLimite}
                  onChange={(evento) => setNuevoLimite(evento.target.value)}
                  className="campo w-full text-cuerpo tabular-nums"
                />
                {reactivacion.error ? <LineaDeEstado tipo="error" titulo={reactivacion.error} /> : null}
                <div className="flex flex-wrap items-center gap-4">
                  <Boton type="submit" tamano="chico" cargando={reactivacion.pendiente}>
                    Confirmar
                  </Boton>
                  <Boton variante="callado" onClick={() => setReactivando(false)}>
                    Volver
                  </Boton>
                </div>
              </form>
            ) : (
              <Boton className="mt-3" variante="secundario" tamano="chico" onClick={abrirReactivar}>
                Reactivar
              </Boton>
            )}
          </Bloque>
        ) : null}
      </Seccion>

      <Seccion titulo="Tope y límite" id="presupuesto-tope">
        <Paso
          etiqueta="Tope"
          nombre="el tope"
          valor={`US$ ${estado.tope}`}
          puedeBajar={estado.tope > 0}
          puedeSubir={estado.tope < MAXIMO_DEL_TOPE_USD}
          alMover={moverTope}
        />
        <p className="text-meta text-apagado">Es tu referencia: al pasarlo, la app sigue y te lo muestra aquí.</p>
        <Paso
          etiqueta="Límite"
          nombre="el límite"
          valor={vista.etiquetaDelLimite}
          puedeBajar={limiteEnPasos > estado.tope}
          puedeSubir={limiteEnPasos < MAXIMO_DEL_LIMITE_USD}
          alMover={moverLimite}
        />
        <p className="text-meta text-apagado">
          Es el freno: al llegar, lo nuevo queda en pausa y lo que ya firmaste sigue. Nunca baja del tope.
        </p>
      </Seccion>

      <Seccion titulo="Por proveedor" id="presupuesto-proveedores">
        <ul aria-label="Gasto por proveedor" className="grid gap-2">
          {vista.porProveedor.map((fila) => (
            <li key={fila.nombre} className="flex justify-between gap-3 text-cuerpo tabular-nums">
              <span>{fila.nombre}</span>
              <span>{fila.monto}</span>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Lo que gasta solo" id="presupuesto-solo">
        <Grupo>
          <FilaConInterruptor
            etiqueta="Ideas nuevas cada domingo"
            detalle={`${dolares(estado.motor.usd)} este mes`}
            encendido={estado.motor.activo}
            alCambiar={(valor) => alternar("motor_semanal", valor)}
          />
          <FilaConInterruptor
            etiqueta="Unir temas parecidos cada noche"
            detalle={`${dolares(estado.fusiones.usd)} este mes`}
            encendido={estado.fusiones.activas}
            alCambiar={(valor) => alternar("fusiones_nocturnas", valor)}
          />
        </Grupo>
        <p className="text-meta text-apagado">
          Corren sin que los pidas. Apagados no gastan. «Proponer ahora» en Ingesta sigue funcionando.
        </p>
      </Seccion>

      {error ? (
        <div className="mt-6">
          <LineaDeEstado tipo="error" titulo={error} />
        </div>
      ) : null}

      {mensaje ? <Aviso mensaje={mensaje} alCerrar={cerrarMensaje} /> : null}
    </div>
  )
}

/** The bar never speaks alone: the figure goes in words and the marks are listed under it (P12). */
function BarraDelMes({ vista }: { vista: VistaDelPresupuesto }) {
  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-2 text-meta font-medium text-tinta tabular-nums">
        {vista.tono === "tinta" ? null : <Warning aria-hidden="true" size={ICONO.chico} />}
        {vista.linea}
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: a native meter cannot be drawn as a sunken rounded track with marks on every browser. */}
      <div
        role="meter"
        aria-label="Gasto del mes"
        aria-valuemin={0}
        aria-valuemax={vista.escala}
        aria-valuenow={vista.usado}
        aria-valuetext={vista.linea}
        className="relative h-riel overflow-hidden rounded-control bg-piedra-honda shadow-hundido"
      >
        <div
          className={cn("h-full rounded-control", vista.tono === "pasado" ? "bg-error" : "bg-tinta")}
          style={{ width: `${vista.relleno}%` }}
        />
        {vista.marcas.map((marca) => (
          <span
            key={marca.etiqueta}
            aria-hidden="true"
            className="absolute inset-y-0 w-px bg-apagado"
            style={{ left: `${marca.porcentaje}%` }}
          />
        ))}
      </div>
      <ul
        aria-label="Marcas de la barra"
        className="flex flex-wrap gap-x-3 gap-y-1 text-meta text-apagado tabular-nums"
      >
        {vista.marcas.map((marca) => (
          <li key={marca.etiqueta}>{`${marca.etiqueta}: ${marca.monto}`}</li>
        ))}
      </ul>
      {vista.pasado ? <LineaDeEstado tipo="aviso" titulo={vista.pasado} /> : null}
    </div>
  )
}

function Paso({
  etiqueta,
  nombre,
  valor,
  puedeBajar,
  puedeSubir,
  alMover,
}: {
  etiqueta: string
  /** «el tope», «el límite»: what the buttons say to a screen reader. */
  nombre: string
  valor: string
  puedeBajar: boolean
  puedeSubir: boolean
  alMover: (delta: number) => void
}) {
  return (
    <div className="flex min-h-fila-baja items-center justify-between gap-3">
      <span className="text-cuerpo">{etiqueta}</span>
      <div className="flex items-center gap-3">
        <Boton
          variante="secundario"
          tamano="chico"
          aria-label={`Bajar ${nombre}`}
          deshabilitado={!puedeBajar}
          className="w-objetivo justify-center px-0"
          onClick={() => alMover(-PASO_DEL_PRESUPUESTO_USD)}
        >
          <Minus aria-hidden="true" size={ICONO.medio} />
        </Boton>
        <output className="min-w-20 text-center text-pieza tabular-nums">{valor}</output>
        <Boton
          variante="secundario"
          tamano="chico"
          aria-label={`Subir ${nombre}`}
          deshabilitado={!puedeSubir}
          className="w-objetivo justify-center px-0"
          onClick={() => alMover(PASO_DEL_PRESUPUESTO_USD)}
        >
          <Plus aria-hidden="true" size={ICONO.medio} />
        </Boton>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: The page** (`app/(app)/ajustes/presupuesto/page.tsx`)

```tsx
import { Volver } from "@/components/ui/volver"
import { leerPresupuestoDelMes } from "@/lib/presupuesto/leer"
import { exigirConi } from "@/lib/sesion/coni"
import { guardarAjusteAccion, reactivarLimiteAccion } from "../acciones"
import { PantallaDePresupuesto } from "./pantalla-de-presupuesto"

/** Ajustes › Presupuesto (spec 2026-11-02): Coni only. The cap is a reference; the limit is the brake. */
export default async function Presupuesto() {
  const { db } = await exigirConi()
  const presupuesto = await leerPresupuestoDelMes(db, Date.now())

  return (
    <div>
      <Volver href="/ajustes">Ajustes</Volver>
      <h1 className="mt-5 text-pantalla text-balance">Presupuesto</h1>
      <p className="mt-1.5 text-meta text-apagado">
        Tu tope es una referencia: al pasarlo, la app sigue. Tu límite es el freno: ahí lo nuevo queda en pausa y lo que
        ya firmaste termina.
      </p>
      <div className="mt-6">
        <PantallaDePresupuesto
          inicial={presupuesto}
          acciones={{ guardar: guardarAjusteAccion, reactivar: reactivarLimiteAccion }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run, expect PASS** — `pnpm test:run tests/unit/pantalla-de-presupuesto.test.tsx`, `pnpm type`, `pnpm lint`. Start the app's dev server inside tmux, as this repo's hook requires (`tmux new-session -d -s presupuesto` running the `dev` script of `package.json`), sign in as Coni and open `/ajustes/presupuesto` at 390 px: the bar, the four marks in one wrapped line, both steppers, the provider list and the two switches; no horizontal scroll.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/ajustes/presupuesto" tests/unit/pantalla-de-presupuesto.test.tsx
git commit -m "Add Ajustes › Presupuesto: the month's bar, cap and limit, Reactivar, providers and switches" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: The Ajustes row, and the cap leaves the main editor

**Files:**
- Create: `app/(app)/ajustes/tu-presupuesto.tsx`, `tests/unit/tu-presupuesto.test.tsx`
- Modify: `app/(app)/ajustes/page.tsx`, `app/(app)/ajustes/editor-de-ajustes.tsx`, `tests/unit/editor-de-ajustes.test.tsx`, `tests/unit/costo.test.tsx`
- Delete: `components/ui/medidor.tsx`, `lib/diseno/medidor.ts`, `tests/unit/medidor.test.ts`

- [ ] **Step 1: Write the failing tests.**

`tests/unit/tu-presupuesto.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { TuPresupuesto } from "@/app/(app)/ajustes/tu-presupuesto"

describe("TuPresupuesto", () => {
  it("links Ajustes to the budget with what the month spent against the cap", () => {
    render(<TuPresupuesto usado={31.6} tope={40} />)
    expect(screen.getByRole("link", { name: "Presupuesto · US$ 32 de 40" })).toHaveAttribute(
      "href",
      "/ajustes/presupuesto",
    )
  })
})
```

In `tests/unit/editor-de-ajustes.test.tsx`:
  - delete `tope: 40,` and `usado: 12.8,` from `INICIAL`;
  - make `acciones` build `guardar` as `vi.fn(async (_cambio: CambioDeAjuste) => ({ ok: true as const, anterior: { campo: "meta", valor: "consultas" } as CambioDeAjuste }))` (the conditional `aviso` for the cap goes away);
  - in the test `"folds the spending cap under Para WAV, with what the page adds there, out of her way"`: rename it to `"folds what is WAV's under Para WAV, and the cap is no longer there"`, delete its two assertions about `"Subir el tope"` and `"Llevas US$ 12,80 este mes"`, keep the other assertions and the element it passes as `paraWav`, and add `expect(screen.queryByRole("button", { name: "Subir el tope" })).toBeNull()`;
  - in `"shows the current settings"` delete the two lines that expect `"US$ 40"` and `"Llevas US$ 12,80 este mes"`;
  - delete the tests `"moves the cap in steps of 5 and saves once, after she stops tapping"`, `"does not take the cap under zero"` and `"shows the server's warning when the cap is under what was spent"`: they moved to `tests/unit/pantalla-de-presupuesto.test.tsx` (Task 14).

`tests/unit/costo.test.tsx` keeps only the `LineaDeSaldo` test (the whole file):

```tsx
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LineaDeSaldo } from "@/components/ui/costo"

describe("costo", () => {
  it("keeps the balance explanation with its figure, left aligned, never centred", () => {
    render(<LineaDeSaldo>ElevenLabs: te quedan 99.000 de 100.000 caracteres.</LineaDeSaldo>)
    expect(screen.getByText(/te quedan/)).not.toHaveClass("text-center")
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test:run tests/unit/tu-presupuesto.test.tsx tests/unit/editor-de-ajustes.test.tsx` (no `TuPresupuesto`; the editor still draws the cap).

- [ ] **Step 3: Implement.**

`app/(app)/ajustes/tu-presupuesto.tsx`:

```tsx
import { Seccion } from "@/components/seccion"
import { FilaNavegacion } from "@/components/ui/filas"
import { Grupo } from "@/components/ui/grupo"
import { filaDePresupuesto } from "@/lib/presupuesto/presentar"

/** Spec 2026-11-02: Ajustes keeps one row with the month against the cap; the panel is Ajustes › Presupuesto. */
export function TuPresupuesto({ usado, tope }: { usado: number; tope: number }) {
  return (
    <Seccion titulo="Gasto" id="ajuste-presupuesto">
      <Grupo>
        <FilaNavegacion href="/ajustes/presupuesto">{filaDePresupuesto(usado, tope)}</FilaNavegacion>
      </Grupo>
    </Seccion>
  )
}
```

`app/(app)/ajustes/page.tsx`: add `import { TuPresupuesto } from "./tu-presupuesto"`, delete the lines `tope: Number(ajustes.tope_mensual_usd),` and `usado: presupuesto.usado,` from `inicial`, and add before the `TusDatos` block:

```tsx
      <div className="mt-10">
        <TuPresupuesto usado={presupuesto.usado} tope={presupuesto.tope} />
      </div>
```

`app/(app)/ajustes/editor-de-ajustes.tsx`, the whole file becomes:

```tsx
"use client"

import { type ReactNode, useCallback, useRef, useState, useTransition } from "react"
import { Chip } from "@/components/chip"
import { Seccion } from "@/components/seccion"
import { Aviso } from "@/components/ui/aviso"
import { FilaConInterruptor, FilaConValor } from "@/components/ui/filas"
import { Grupo } from "@/components/ui/grupo"
import { LineaDeEstado } from "@/components/ui/linea-de-estado"
import { MasOpciones } from "@/components/ui/mas-opciones"
import type { CambioDeAjuste } from "@/lib/acciones/ajustes"
import type { Resultado } from "@/lib/acciones/resultado"
import { canonicos, DESTINOS, type Destino, nombreDeDestino } from "@/lib/dominio/destinos"

export interface AjustesEditables {
  meta: "consultas" | "talleres" | "marca"
  dias: number[]
  hora: string
  avisosResumen: boolean
  avisosUrgentes: boolean
  /** Where reels are published unless she says otherwise at gate 2. */
  destinos: Destino[]
}

export interface AccionesDelEditor {
  guardar: (cambio: CambioDeAjuste) => Promise<Resultado<{ anterior: CambioDeAjuste; aviso?: string }>>
}

const METAS = [
  { valor: "consultas", etiqueta: "Consultas" },
  { valor: "talleres", etiqueta: "Talleres" },
  { valor: "marca", etiqueta: "Marca" },
] as const

const DIAS = [
  { numero: 1, etiqueta: "Lun" },
  { numero: 2, etiqueta: "Mar" },
  { numero: 3, etiqueta: "Mié" },
  { numero: 4, etiqueta: "Jue" },
  { numero: 5, etiqueta: "Vie" },
  { numero: 6, etiqueta: "Sáb" },
  { numero: 7, etiqueta: "Dom" },
] as const

/** The cap, the limit and the switches are edited in Ajustes › Presupuesto: here they change nothing on screen. */
function aplicar(valores: AjustesEditables, cambio: CambioDeAjuste): AjustesEditables {
  switch (cambio.campo) {
    case "meta":
      return { ...valores, meta: cambio.valor }
    case "dias":
      return { ...valores, dias: cambio.valor }
    case "hora":
      return { ...valores, hora: cambio.valor }
    case "avisos_resumen":
      return { ...valores, avisosResumen: cambio.valor }
    case "avisos_urgentes":
      return { ...valores, avisosUrgentes: cambio.valor }
    case "destinos":
      return { ...valores, destinos: cambio.valor }
    case "tope":
    case "limite":
    case "motor_semanal":
    case "fusiones_nocturnas":
      return valores
  }
}

type CampoDelEditor = "meta" | "dias" | "hora" | "avisos_resumen" | "avisos_urgentes" | "destinos"

function valorDe(valores: AjustesEditables, campo: CampoDelEditor): CambioDeAjuste {
  switch (campo) {
    case "meta":
      return { campo, valor: valores.meta }
    case "dias":
      return { campo, valor: valores.dias }
    case "hora":
      return { campo, valor: valores.hora }
    case "avisos_resumen":
      return { campo, valor: valores.avisosResumen }
    case "avisos_urgentes":
      return { campo, valor: valores.avisosUrgentes }
    case "destinos":
      return { campo, valor: valores.destinos }
  }
}

interface Mensaje {
  texto: string
  deshacer?: () => void
}

/** Settings edited in place: every change saves by itself and can be undone from the toast (docs/PRODUCT.md). */
export function EditorDeAjustes({
  inicial,
  acciones,
  linkedinConectado,
  avisosDelCelular,
  paraWav,
}: {
  inicial: AjustesEditables
  acciones: AccionesDelEditor
  /** A connected LinkedIn posts by itself at the approved time; otherwise it goes by hand. */
  linkedinConectado: boolean
  /** The phone block (install, turn on, test): it belongs to the same «Avisos» section as the switches. */
  avisosDelCelular?: ReactNode
  /** What the page puts in the Para WAV fold (the link to the accounts). */
  paraWav?: ReactNode
}) {
  const [valores, setValores] = useState(inicial)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, empezar] = useTransition()
  const cerrarMensaje = useCallback(() => setMensaje(null), [])

  // The latest values, for the callbacks that run later (the undo).
  const ultimos = useRef(valores)
  ultimos.current = valores

  function enviar(cambio: CambioDeAjuste, antes: CambioDeAjuste) {
    setError(null)
    setValores((actuales) => aplicar(actuales, cambio))
    empezar(async () => {
      const resultado = await acciones.guardar(cambio)
      if (!resultado.ok) {
        setValores((actuales) => aplicar(actuales, antes))
        setError(resultado.error)
        return
      }
      setMensaje({ texto: resultado.aviso ?? "Guardado", deshacer: () => deshacer(resultado.anterior) })
    })
  }

  function deshacer(anterior: CambioDeAjuste) {
    setValores((actuales) => aplicar(actuales, anterior))
    empezar(async () => {
      const resultado = await acciones.guardar(anterior)
      if (!resultado.ok) setError(resultado.error)
    })
  }

  function cambiar(cambio: CambioDeAjuste & { campo: CampoDelEditor }) {
    enviar(cambio, valorDe(ultimos.current, cambio.campo))
  }

  function alternarDia(numero: number) {
    const puestos = valores.dias.includes(numero)
    if (puestos && valores.dias.length === 1) {
      setError("Deja al menos un día de publicación.")
      return
    }
    const siguientes = puestos ? valores.dias.filter((dia) => dia !== numero) : [...valores.dias, numero]
    cambiar({ campo: "dias", valor: siguientes.sort((a, b) => a - b) })
  }

  function alternarDestino(destino: Destino) {
    const puesto = valores.destinos.includes(destino)
    if (puesto && valores.destinos.length === 1) {
      setError("Deja al menos un destino.")
      return
    }
    const siguientes = puesto ? valores.destinos.filter((d) => d !== destino) : [...valores.destinos, destino]
    cambiar({ campo: "destinos", valor: canonicos(siguientes) })
  }

  return (
    <div>
      <Seccion titulo="Publicación" id="ajuste-publicacion">
        <Grupo>
          <FilaConValor
            etiqueta="Meta de este mes"
            valor={valores.meta}
            opciones={METAS}
            alCambiar={(valor) => cambiar({ campo: "meta", valor })}
          />
        </Grupo>
        <h3 className="mx-0.5 mt-2 text-meta font-semibold">Días de publicación</h3>
        <div className="grid grid-cols-7 gap-1">
          {DIAS.map((dia) => (
            <Chip
              key={dia.numero}
              className="px-0"
              conCheck={false}
              presionado={valores.dias.includes(dia.numero)}
              onClick={() => alternarDia(dia.numero)}
            >
              {dia.etiqueta}
            </Chip>
          ))}
        </div>
        <Grupo>
          <FilaConValor
            tipo="time"
            etiqueta="Hora de publicación"
            titulo="A las"
            sufijo="hora de Chile"
            valor={valores.hora}
            alCambiar={(hora) => {
              setValores((actuales) => ({ ...actuales, hora }))
              if (hora && hora !== ultimos.current.hora) cambiar({ campo: "hora", valor: hora })
            }}
          />
        </Grupo>
      </Seccion>

      <Seccion titulo="Dónde se publica" id="ajuste-destinos">
        <Grupo>
          {DESTINOS.map((destino) => (
            <FilaConInterruptor
              key={destino}
              etiqueta={nombreDeDestino(destino)}
              detalle={destino === "linkedin" ? (linkedinConectado ? "Sale solo" : "A mano") : undefined}
              encendido={valores.destinos.includes(destino)}
              alCambiar={() => alternarDestino(destino)}
            />
          ))}
        </Grupo>
        <p className="text-meta text-apagado">
          Si LinkedIn está conectado, a la hora aprobada sale solo. Si no, te aviso y te dejo el video y el texto listos
          para subirlo a mano.
        </p>
      </Seccion>

      <Seccion titulo="Avisos" id="ajuste-avisos">
        <Grupo>
          <FilaConInterruptor
            etiqueta="Resumen diario a las 08:30"
            encendido={valores.avisosResumen}
            alCambiar={(valor) => cambiar({ campo: "avisos_resumen", valor })}
          />
          <FilaConInterruptor
            etiqueta="Avisarme apenas falle algo"
            encendido={valores.avisosUrgentes}
            alCambiar={(valor) => cambiar({ campo: "avisos_urgentes", valor })}
          />
        </Grupo>
        <p className="text-meta text-apagado">Los cambios se guardan solos. Lo que ya aprobaste mantiene su fecha.</p>
        {avisosDelCelular ? <div className="mt-4">{avisosDelCelular}</div> : null}
      </Seccion>

      {/* Exit critique 3: accounts, keys, balances and Claude are WAV's operation, folded out of her way. */}
      <MasOpciones className="mt-8" titulo="Para WAV" resumen="Cuentas, llaves, saldos y Claude">
        {paraWav}
      </MasOpciones>

      {error ? (
        <div className="mt-6">
          <LineaDeEstado tipo="error" titulo={error} />
        </div>
      ) : null}

      {mensaje ? <Aviso mensaje={mensaje.texto} alCerrar={cerrarMensaje} alDeshacer={mensaje.deshacer} /> : null}
    </div>
  )
}
```

- [ ] **Step 4: Remove the old meter** — `git rm components/ui/medidor.tsx lib/diseno/medidor.ts tests/unit/medidor.test.ts`, then `grep -rn "Medidor\|tonoDelMedidor\|diseno/medidor" app components lib tests` → nothing.

- [ ] **Step 5: Run, expect PASS** — `pnpm type`, `pnpm lint`, `pnpm test:run tests/unit/tu-presupuesto.test.tsx tests/unit/editor-de-ajustes.test.tsx tests/unit/costo.test.tsx tests/unit/saldos-ajustes.test.tsx`, and `head -1 "app/(app)/ajustes/editor-de-ajustes.tsx" "app/(app)/ajustes/presupuesto/pantalla-de-presupuesto.tsx"` prints `"use client"` twice.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/ajustes/tu-presupuesto.tsx" "app/(app)/ajustes/page.tsx" "app/(app)/ajustes/editor-de-ajustes.tsx" tests/unit/tu-presupuesto.test.tsx tests/unit/editor-de-ajustes.test.tsx tests/unit/costo.test.tsx
git commit -m "Link Ajustes to the budget panel and take the cap out of the main editor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: End to end, accessibility, the Ajustes baseline and the docs

**Files:**
- Create: `tests/e2e/presupuesto.spec.ts`
- Modify: `tests/e2e/ajustes.spec.ts`, `tests/e2e/ideas.spec.ts`, `tests/e2e/accesibilidad.spec.ts`, `tests/e2e/visual.spec.ts-snapshots/ajustes-app-darwin.png` (regenerated), `docs/TRASPASO.md`, `CLAUDE.md`

These e2e tests are the acceptance of Tasks 11 to 15, so they are expected to pass at once. A failure here is a bug: reproduce it first in a unit or integration test, then fix.

- [ ] **Step 1: The flows** (`tests/e2e/presupuesto.spec.ts`)

```ts
import { expect, test } from "@playwright/test"
import { pool } from "../integration/db"
import { alerta, capturar } from "./ayudas"

const CONI = "c0000000-0000-4000-8000-000000000001"

async function limpiar() {
  await pool.query(
    "update public.ajustes set tope_mensual_usd = 40, limite_duro_usd = null, motor_semanal_activo = true, fusiones_nocturnas_activas = true",
  )
  await pool.query("delete from public.gastos")
  await pool.query("delete from public.limites_del_mes")
  await pool.query("delete from public.avisos where clave like 'limite_alcanzado:%'")
}

async function gastado(usd: number) {
  await pool.query(
    "insert into public.gastos (proveedor, paso, mes, estimado_usd, real_usd, estado, clave) values ('heygen', 'e2e', date_trunc('month', now() at time zone 'America/Santiago')::date, $1, $1, 'confirmado', 'e2e-presupuesto-gasto')",
    [usd],
  )
}

async function ajustes() {
  const { rows } = await pool.query("select * from public.ajustes")
  return rows[0]
}

test.beforeEach(limpiar)
test.afterAll(limpiar)

test("Coni opens her budget from Ajustes and moves her cap and her limit, logged with her as the actor", async ({
  page,
}) => {
  // `eventos` is append-only, so earlier runs stay: only what this test writes is looked at.
  const { rows: previos } = await pool.query("select coalesce(max(id), 0) as id from public.eventos")
  await gastado(12.8)
  await page.goto("/ajustes")
  await page.getByRole("link", { name: "Presupuesto · US$ 13 de 40" }).click()

  await expect(page.getByRole("heading", { name: "Presupuesto", level: 1 })).toBeVisible()
  await expect(page.getByText("Llevas US$ 12,80 de tu tope de US$ 40,00 este mes")).toBeVisible()
  await expect(page.getByText("US$ 80 (el doble del tope)")).toBeVisible()

  await page.getByRole("button", { name: "Subir el tope" }).click()
  await page.getByRole("button", { name: "Subir el tope" }).click()
  await expect(page.getByText("US$ 100 (el doble del tope)")).toBeVisible()
  await expect.poll(async () => Number((await ajustes()).tope_mensual_usd)).toBe(50)
  const { rows } = await pool.query(
    "select actor_usuario from public.eventos where id > $1 and tabla = 'ajustes' and datos ->> 'tope_mensual_usd' = '50.00'",
    [previos[0].id],
  )
  expect(rows.map((r) => r.actor_usuario)).toEqual([CONI])

  await page.getByRole("button", { name: "Bajar el límite" }).click()
  await expect(page.getByText("US$ 95", { exact: true })).toBeVisible()
  await expect.poll(async () => Number((await ajustes()).limite_duro_usd)).toBe(95)
  await capturar(page, "presupuesto")
})

test("at the limit she reactivates the month with one confirmation, and a short limit is explained", async ({
  page,
}) => {
  await gastado(80)
  await page.goto("/ajustes/presupuesto")

  await expect(page.getByText("Pasaste tu tope. La app sigue hasta tu límite de US$ 80,00.")).toBeVisible()
  await expect(
    page.getByText("Llegaste a tu límite de US$ 80,00. Lo nuevo quedó en pausa; lo que ya firmaste sigue."),
  ).toBeVisible()

  await page.getByRole("button", { name: "Reactivar" }).click()
  const campo = page.getByLabel("Tu límite de este mes")
  await expect(campo).toHaveValue("120")
  await campo.fill("70")
  await page.getByRole("button", { name: "Confirmar" }).click()
  await expect(alerta(page, "Ese límite no alcanza: ya gastaste US$ 80,00 este mes. Elige uno mayor.")).toBeVisible()
  await expect(campo).toHaveValue("70")

  await campo.fill("120")
  await page.getByRole("button", { name: "Confirmar" }).click()
  await expect(page.getByText("Listo: tu límite de este mes es US$ 120,00.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Reactivar" })).toHaveCount(0)
  const { rows } = await pool.query("select limite_usd::float8 as limite from public.limites_del_mes")
  expect(rows).toEqual([{ limite: 120 }])

  await page.reload()
  await expect(page.getByText("Este mes tu límite es US$ 120,00 porque lo reactivaste.")).toBeVisible()
  await capturar(page, "presupuesto-reactivado")
})

test("she switches off the Sunday ideas and the nightly merges", async ({ page }) => {
  await page.goto("/ajustes/presupuesto")

  await page.getByRole("switch", { name: "Ideas nuevas cada domingo" }).click()
  await expect.poll(async () => (await ajustes()).motor_semanal_activo).toBe(false)
  await page.getByRole("switch", { name: "Unir temas parecidos cada noche" }).click()
  await expect.poll(async () => (await ajustes()).fusiones_nocturnas_activas).toBe(false)

  await page.reload()
  await expect(page.getByRole("switch", { name: "Ideas nuevas cada domingo" })).toHaveAttribute("aria-checked", "false")
})

test("a cap that leaves the limit under what was spent is saved with a warning", async ({ page }) => {
  await gastado(22)
  await page.goto("/ajustes/presupuesto")

  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "Bajar el tope" }).click()

  await expect(
    page.getByText(
      "Ya gastaste US$ 22,00; con este límite lo nuevo queda en pausa hasta el próximo mes. Lo que ya firmaste sigue.",
    ),
  ).toBeVisible()
  await expect.poll(async () => Number((await ajustes()).tope_mensual_usd)).toBe(10)
})
```

- [ ] **Step 2: Move the old Ajustes flows.** In `tests/e2e/ajustes.spec.ts`:
  - add `, limite_duro_usd = null` after `tope_mensual_usd = 40` in the `update` of `limpiar`;
  - in the test `"settings save by themselves, can be undone, and are logged with her as the actor"`: rename it `"settings save by themselves and can be undone"`, delete its first two lines (the `eventos` comment and `const { rows: previos } = …`), delete the block from `// The cap is WAV's: it folds under "Para WAV".` down to `expect(rows.map((r) => r.actor_usuario)).toEqual(["c0000000-0000-4000-8000-000000000001"])`, and after `await page.reload()` delete the two lines `await abrirDesplegable(page, "Para WAV")` and `await expect(page.getByText("US$ 50")).toBeVisible()` (the audit check of the cap moved to `presupuesto.spec.ts`);
  - delete the test `"a cap under what was spent is saved with a warning"` (moved to `presupuesto.spec.ts`).

  In `tests/e2e/ideas.spec.ts` add `, limite_duro_usd = null` to the two `update public.ajustes set tope_mensual_usd = 40` (in `beforeEach` and `afterAll`), and in `"when the month covers one, she is asked and nothing starts until she says yes"` replace `update public.ajustes set tope_mensual_usd = 1.5` with `update public.ajustes set tope_mensual_usd = 1.5, limite_duro_usd = 1.5` (the batch now checks the limit, twice a bare cap of 1.5).

- [ ] **Step 3: Axe on the new screen.** In `tests/e2e/accesibilidad.spec.ts` add `"/ajustes/presupuesto",` to `rutas()` right after `"/ajustes/pagina-de-ia",`, replace `update public.ajustes set tope_mensual_usd = 1.5` with `update public.ajustes set tope_mensual_usd = 1.5, limite_duro_usd = 1.5`, and replace the `finally` reset `update public.ajustes set tope_mensual_usd = 40` with `update public.ajustes set tope_mensual_usd = 40, limite_duro_usd = null`. The new screen folds nothing, so `abrirPliegues` needs no new branch.

- [ ] **Step 4: Run** — `pnpm test:e2e tests/e2e/presupuesto.spec.ts tests/e2e/ajustes.spec.ts tests/e2e/ideas.spec.ts tests/e2e/accesibilidad.spec.ts tests/e2e/guion.spec.ts tests/e2e/video.spec.ts` → PASS (the known flakies `linkedin.spec.ts:63` and `inicio.spec.ts:99` are not in this list). Axe must report nothing for `/ajustes/presupuesto` and the touch-target audit of the same file must pass for it.

- [ ] **Step 5: The Ajustes baseline.** The main Ajustes screen changed on purpose (the cap left the Para WAV fold; the «Gasto» row is new). Run `pnpm test:e2e tests/e2e/visual.spec.ts -g "ajustes"`, look at the diff image Playwright writes for `ajustes` and confirm the only differences are the new row and the fold's summary line. Then `pnpm test:e2e tests/e2e/visual.spec.ts -g "ajustes" --update-snapshots`; `git status` must show only `tests/e2e/visual.spec.ts-snapshots/ajustes-app-darwin.png` changed (the Cuentas screens did not change: if their baselines moved, find out why before going on).

- [ ] **Step 6: Docs.** In `docs/TRASPASO.md`, under «Lo que está hecho», after the last bullet, add:

```markdown
- **Presupuesto: el tope pasa a alarma y el límite duro frena** (cambio 12a del pedido de Coni, decisión A1; spec `2026-11-02-conidolly-presupuesto-design.md`, plan `2026-11-02-presupuesto.md`, rama `feat/presupuesto`, tablero #14, pendiente de despliegue): migración `20261103000100` (`ajustes.limite_duro_usd`, nulo es el doble del tope y nunca baja del tope; `limites_del_mes`, que solo escribe `fijar_limite_del_mes` de Coni; `limite_del_mes()`; `reservar_gasto` con `p_firmado`: lo nuevo frena con `limite_alcanzado` al llegar al límite del mes de Santiago y lo firmado siempre reserva; aviso `limite_alcanzado`). Lo firmado que nunca frena: la voz de una pieza ya firmada en la puerta 1 (`vozFirmada`: `en_render` con `puerta1_hash`), el video y el acortado de un carrusel firmado (`reservarGastoFirmado`); la voz del borrador, «Preparar mi voz» y las tomas nuevas en la puerta 1 son gasto nuevo y frenan, y la puerta 1 cierra sus botones de voz en el límite. Frenan el guion, el carrusel, la revisión del guion, la idea propia, el lote (que mira el límite), el material, el motor y los temas; los caminos de Trigger avisan con `avisarLimite` (un aviso urgente al mes a Coni con clave `limite_alcanzado:AAAA-MM`, que abre Ajustes › Presupuesto, y un correo a WAV la primera vez); las acciones de Vercel solo muestran el texto en pantalla. Interruptores `motor_semanal_activo` y `fusiones_nocturnas_activas` (apagados responden «apagado», no fallan; «Proponer ahora» de Ingesta no los mira). Ajustes › Presupuesto: barra con marcas en 50, 80 y 100 % del tope y en el límite, pasos de tope y límite (subir el tope sobre el límite propio lo vuelve al doble y lo dice), «Reactivar» con el límite más el tope, gasto por proveedor y «Lo que gasta solo». Ajustes muestra la fila «Presupuesto · US$ X de Y» y ya no tiene el tope en «Para WAV»; `Medidor` se fue. Despliegue: `db push`, merge (Vercel publica solo), Trigger con OK de Federico (checklist en la tarea 17 del plan).
```

In `CLAUDE.md`, in the rule «Decidido por Coni el 01-11-2026», replace `el tope de gasto pasa a alarma con límite duro del doble (llega con el cambio 12a, hoy aún frena)` with `el tope de gasto es alarma y frena el límite duro, por defecto el doble (cambio 12a, plan 2026-11-02-presupuesto)`.

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/presupuesto.spec.ts tests/e2e/ajustes.spec.ts tests/e2e/ideas.spec.ts tests/e2e/accesibilidad.spec.ts tests/e2e/visual.spec.ts-snapshots/ajustes-app-darwin.png docs/TRASPASO.md CLAUDE.md
git commit -m "Cover the budget panel end to end and document the hard limit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Full gate, review and release

**Files:** none new (fixes found here go to the file they belong to, each with its failing test first).

- [ ] **Step 1: Full gate** — `pnpm lint && pnpm type && pnpm test:run && pnpm test:db && pnpm build`, then `pnpm test:e2e`. Then:
  - `git diff main -- app components lib supabase tests | grep "^+" | grep "—"` → nothing (no em dash in new copy, SQL, comments or tests);
  - `head -1 "app/(app)/ajustes/presupuesto/pantalla-de-presupuesto.tsx" "app/(app)/ajustes/editor-de-ajustes.tsx"` → `"use client"` twice;
  - `grep -rn "as any\|@ts-expect-error" lib/presupuesto lib/acciones/presupuesto.ts "app/(app)/ajustes"` → nothing;
  - `grep -rn "TEXTO_TOPE\|MOTIVO_TOPE\|avisarTope\|superaElTope\|textoTopeAlAcortar\|Súbelo en Ajustes" app lib components` → nothing;
  - `grep -rln "tope_alcanzado" lib` → only `lib/avisos/tipos.ts` and `lib/datos/repositorio.ts` (kept on purpose: old notices and the deploy window).

- [ ] **Step 2: Review.** A reviewer subagent reads `git diff main...feat/presupuesto` against the spec and this plan (focus: every unsigned path still reaches `reservar_gasto` without `p_firmado`; every signed path uses `reservarGastoFirmado` and a voice is signed only when `vozFirmada` holds; no path can spend past the limit when a notice fails). Fix what it finds, each fix with its failing test first, and run Step 1 again.

- [ ] **Step 3: Release, by the standing authorization of 01-11-2026** (repo `CLAUDE.md`: issue on the board, tests and CI green, reviews approved, a dry run with only the expected migration). The executor does steps 1 to 6; step 7 waits for Federico.

1. `git push -u origin feat/presupuesto` and open the PR (private repo):

```bash
gh pr create --base main --head feat/presupuesto --title "Budget panel: the cap becomes an alarm and a hard limit brakes (change 12a)" --body "$(cat <<'BODY'
Change 12a of Coni's request (decision A1). Spec docs/superpowers/specs/2026-11-02-conidolly-presupuesto-design.md, plan docs/superpowers/plans/2026-11-02-presupuesto.md. Closes #14.

- Migration 20261103000100: hard limit (2 x cap by default), month limits through fijar_limite_del_mes (Coni only), limite_del_mes(), reservar_gasto with p_firmado, notice limite_alcanzado.
- Signed work (voice, video, shortening of a signed carousel) never stops; new work pauses at the limit and Coni is told once a month.
- Ajustes › Presupuesto: bar with marks, cap and limit steppers, Reactivar, spend by provider, switches for the weekly engine and the nightly merges.

Deploy order: supabase db push, merge (Vercel), then Trigger.dev with Federico's OK.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

   Wait for CI green and the review approved. Move issue #14 on the board (WAV-WaAreVision/projects/1) to its review state.
2. `supabase db push --dry-run` (linked to production, ref `mvfytttfxmzzjajecsch`): it must list exactly `20261103000100_presupuesto.sql`. Anything else pending: stop and ask Federico.
3. `supabase db push`.
4. Read-only check in production (SELECT only, through the Supabase MCP `execute_sql` on `mvfytttfxmzzjajecsch`):

```sql
select pg_get_function_identity_arguments('public.reservar_gasto'::regproc) as firma;
select public.limite_del_mes() as limite, tope_mensual_usd, limite_duro_usd, motor_semanal_activo,
       fusiones_nocturnas_activas, (select count(*) from public.limites_del_mes) as meses
  from public.ajustes;
select pg_get_constraintdef(oid) as tipos from pg_constraint where conname = 'avisos_tipo_check';
```

   Expected: the signature ends in `p_firmado boolean`; `limite` = 2 × `tope_mensual_usd`, `limite_duro_usd` null, both switches true, `meses` 0; the notice list contains `limite_alcanzado`.
5. Merge into `main` (`gh pr merge --merge`): Vercel publishes by itself. Wait 15 to 45 s and check it is served: `curl -s https://conidolly.vercel.app/ajustes/presupuesto -o /dev/null -w "%{http_code}"` answers a redirect to sign in (not 404), and as Coni the screen shows the bar with this month's spend.
6. Tell Federico what went out (migration, merge commit, Vercel deployment) and that Trigger.dev still runs the old code. Until it is deployed, an old Trigger run that reaches the new limit reads `limite_alcanzado` as an unknown error, and old voice or video runs are not marked as signed; the limit is twice the cap, far above this month's spend, so the window is safe for a short while.
7. **Only with Federico's OK:** Trigger.dev, deployed from the `main` checkout after the merge, not from the worktree (engine, maintenance, voice, video, carousel assembly, ingestion and the writer changed): `pnpm install`, then `TRIGGER_PROJECT_REF=proj_spcwrflbtedwehbvsmhv pnpm dlx trigger.dev@4.6.4 deploy --env prod --skip-update-check`. Then: the next `mantenimiento-nocturno` run lists `fusiones` with a result (or `{ apagado: true }` if Coni turned it off), and the Sunday `motor-semanal` run either works or answers `{ resultado: "apagado" }`. Update the bullet of TRASPASO (merge, base `20261103000100`, Trigger version, date) and move #14 to Done.

---

## Spec coverage

| Spec section | Task |
|---|---|
| D1: signed spend (voice after gate 1, video, shortening of a signed carousel) never stops; voice before gate 1 is new spend and stops | 1 (`p_firmado`), 2 (`reservarGastoFirmado`), 5 (`vozFirmada`), 6, 13 |
| D2: engine and nightly merges stay ON with a switch and visible spend; topic embeddings and naming have no switch | 1, 9, 10, 12, 14 |
| D3: only the hard limit notifies (urgent push once a month, one WAV email); 50/80/100 % only in the panel | 1, 3, 4, 8, 9, 10, 12, 14 |
| D4: «Reactivar» prefilled with limit + cap, one confirmation | 1, 11, 12, 14, 16 |
| D5: limit defaults to 2 × cap, set by Coni, never under the cap | 1, 11, 12, 14 |
| D6: `reservar_gasto` is the single gate, same per-month lock | 1 |
| D7: nothing restarts by itself after reactivating | 11 (`reactivarLimite` only writes the month's row) |
| Data model: `ajustes` columns and check, `limites_del_mes` + RLS, `limite_del_mes()` | 1 |
| `reservar_gasto(…, p_firmado)` dropped and recreated, `reservar_gasto_general` updated | 1 |
| `fijar_limite_del_mes` (security definer, `search_path = ''`, Coni only, `limite_bajo`) | 1, 11 |
| Notice type `limite_alcanzado`, full `avisos_tipo_check` rewrite | 1 |
| Repository maps both codes, `firmado` | 2 |
| `avisarLimite` (monthly clave, text, route, WAV once, failure propagates) | 3 |
| Paths table: script, carousel, review, idea, batch | 4, 7 |
| Paths table: voice (signed after gate 1, stopped before it), video, carousel shortening | 5, 6 |
| Paths table: material ingestion | 8 |
| Paths table: weekly engine; topic maintenance and nightly fusions | 9, 10 |
| Switches read at start, «apagado» not a failure, «Proponer ahora» unaffected | 9, 10 |
| «tope» → «límite» where it means the brake; batch check and video cost line against `limite_del_mes` | 4 to 8, 13 |
| Screen Ajustes › Presupuesto (bar, steppers, reset message, at-the-limit box, providers, «Lo que gasta solo») and the Ajustes row | 12, 14, 15 |
| Tests: DB, code, UI, e2e + axe; ~30 existing files updated, not deleted | every task, 16 |
| Rollout: one migration by the standing authorization; Trigger deploy with Federico's OK | 17 |
| Out of scope (20 % overrun pause, subscriptions, per-line budgets, 12b, 50/80/100 notices) | not built |
