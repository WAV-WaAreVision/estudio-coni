import { afterAll, describe, expect, it } from "vitest"
import { cambiosDesdePieza, piezaDesdeFila } from "@/lib/datos/piezas"
import { transicionar } from "@/lib/dominio/estados"
import { asumir, CONI, como, comoConi, comoMantenedor, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { crearPiezaEn, leer } from "./flujo"

afterAll(() => pool.end())

const instante = (valor: string | Date | null | undefined): number | null =>
  valor === null || valor === undefined ? null : new Date(valor).getTime()

const EDITAR = "select * from public.editar_texto_como_coni($1, $2, $3, $4::jsonb)"
const BLOQUEA = JSON.stringify([{ regla: "aviso_avatar", tipo: "bloquea", mensaje: "Falta el aviso." }])

describe("editar_texto_como_coni", () => {
  it("guarda el texto y la revisión como Coni y deja a Coni en el registro", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const antes = await leer(c, id)
      await asumir(c, comoConi)

      const { rows } = await c.query(EDITAR, [id, antes.version, "Texto nuevo", BLOQUEA])

      expect(rows[0]).toMatchObject({ texto: "Texto nuevo", version: antes.version + 1, estado: "guion_por_aprobar" })
      expect(rows[0].revision).toEqual(JSON.parse(BLOQUEA))
      await asumir(c, comoPostgres)
      const { rows: eventos } = await c.query(
        "select actor_usuario, actor_rol from public.eventos where pieza_id = $1 order by id desc limit 1",
        [id],
      )
      expect(eventos[0]).toEqual({ actor_usuario: CONI, actor_rol: "authenticated" })
    })
  })

  it("rechaza al servicio y al mantenedor", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { version } = await leer(c, id)
      for (const sesion of [comoServicio, comoMantenedor]) {
        await asumir(c, sesion)
        const err = await fallaCon(c, EDITAR, [id, version, "Texto", "[]"])
        expect(err.message).toBe("solo_coni_edita_texto")
      }
    })
  })

  it("rechaza una versión que ya no es la de la pieza", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const err = await fallaCon(c, EDITAR, [id, version - 1, "Texto", "[]"])
      expect(err.message).toBe("version_desfasada")
    })
  })

  it("rechaza editar el texto de una pieza que no está en un paso donde se edita", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const err = await fallaCon(c, EDITAR, [id, version, "Texto", "[]"])
      expect(err.message).toBe("estado_no_editable")
    })
  })

  it("rechaza una pieza que no existe", async () => {
    await como(comoConi, async (c) => {
      const err = await fallaCon(c, EDITAR, ["00000000-0000-4000-8000-0000000000aa", 0, "Texto", "[]"])
      expect(err.message).toBe("pieza_inexistente")
    })
  })

  it("rechaza una revisión que no es una lista", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      const { version } = await leer(c, id)
      await asumir(c, comoConi)
      const err = await fallaCon(c, EDITAR, [id, version, "Texto", JSON.stringify({ hallazgos: [] })])
      expect(err.message).toBe("revision_invalida")
    })
  })

  it("no abre a Coni la escritura directa de la revisión", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      const err = await fallaCon(
        c,
        "update public.piezas set revision = $2::jsonb, version = version + 1 where id = $1",
        [id, BLOQUEA],
      )
      expect(err.message).toBe("revision_solo_servidor")
    })
  })

  for (const destino of ["guion_por_aprobar", "video_por_aprobar", "programado"] as const) {
    it(`deja la pieza igual que el dominio cuando está en ${destino}`, async () => {
      await como(comoPostgres, async (c) => {
        const id = await crearPiezaEn(c, destino)
        const antes = await leer(c, id)
        const esperado = cambiosDesdePieza(transicionar(piezaDesdeFila(antes), { tipo: "editar_texto" }).pieza)
        await asumir(c, comoConi)

        const { rows } = await c.query(EDITAR, [id, antes.version, "Texto nuevo", "[]"])

        const guardada = rows[0]
        expect(guardada.estado).toBe(esperado.estado)
        expect(guardada.version).toBe(antes.version + 1)
        expect(guardada.intento).toBe(esperado.intento)
        expect(guardada.explicacion).toBe(esperado.explicacion)
        expect(guardada.puerta1_hash).toBe(esperado.puerta1_hash)
        expect(guardada.puerta2_video_id).toBe(esperado.puerta2_video_id)
        expect(guardada.puerta2_hash_texto).toBe(esperado.puerta2_hash_texto)
        expect(instante(guardada.puerta2_publicar_en)).toBe(instante(esperado.puerta2_publicar_en))
        expect(instante(guardada.puerta2_en)).toBe(instante(esperado.puerta2_en))
        expect(guardada.texto).toBe("Texto nuevo")
      })
    })
  }
})
