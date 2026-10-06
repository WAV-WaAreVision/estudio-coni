import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoPostgres, comoServicio, fallaCon, pool } from "./db"
import { actualizar, crearPiezaEn, leer } from "./flujo"

afterAll(() => pool.end())

const ENLACE = "https://www.instagram.com/reel/abc123/"

describe("subir a mano: esquema", () => {
  it("deja que el sistema entregue la pieza programada para subir y conserva lo aprobado", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "para_subir_a_mano")
      const fila = await leer(c, id)
      expect(fila.estado).toBe("para_subir_a_mano")
      expect(fila.puerta2_hash_texto).not.toBeNull()
      expect(fila.puerta2_por).toBe(CONI)
    })
  })

  it("exige que una pieza para subir o subida a mano tenga el video y el texto aprobados", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "para_subir_a_mano")
      const { version } = await leer(c, id)
      const error = await fallaCon(
        c,
        "update public.piezas set puerta2_video_id = null, puerta2_hash_texto = null, puerta2_publicar_en = null, puerta2_en = null, version = $2 where id = $1",
        [id, version + 1],
      )
      expect(error.message).toMatch(/aprobada_para_publicar/)
    })
  })

  it("deja que solo Coni marque la pieza como subida y deja su nombre en el registro", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "para_subir_a_mano")
      const { version: vista } = await leer(c, id)
      await asumir(c, comoServicio)
      const delServicio = await fallaCon(
        c,
        "update public.piezas set estado = 'publicado_a_mano', version = $2 where id = $1",
        [id, vista + 1],
      )
      expect(delServicio.message).toBe("solo_coni_entra_a_puerta")
      await asumir(c, comoMantenedor)
      const delMantenedor = await c.query(
        "update public.piezas set estado = 'publicado_a_mano', version = $2 where id = $1",
        [id, vista + 1],
      )
      expect(delMantenedor.rowCount).toBe(0)
      await asumir(c, comoConi)
      const { version } = await leer(c, id)
      const { rows } = await actualizar(c, id, version, {
        estado: "publicado_a_mano",
        version: version + 1,
        permalink: ENLACE,
      })
      expect(rows[0]).toMatchObject({ estado: "publicado_a_mano", permalink: ENLACE })
      await asumir(c, comoPostgres)
      const { rows: eventos } = await c.query(
        "select actor_usuario, actor_rol, datos ->> 'estado' as estado from public.eventos where pieza_id = $1 and tabla = 'piezas' order by id desc limit 1",
        [id],
      )
      expect(eventos[0]).toEqual({ actor_usuario: CONI, actor_rol: "authenticated", estado: "publicado_a_mano" })
    })
  })

  it("no deja que el servicio salte a publicado_a_mano aunque la pieza esté programada", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado")
      await asumir(c, comoServicio)
      const { version } = await leer(c, id)
      const error = await fallaCon(
        c,
        "update public.piezas set estado = 'publicado_a_mano', version = $2 where id = $1",
        [id, version + 1],
      )
      expect(error.message).toBe("solo_coni_entra_a_puerta")
    })
  })

  it("acepta el aviso listo_para_subir", async () => {
    await como(comoServicio, async (c) => {
      await c.query(
        "insert into public.avisos (tipo, clave, mensaje) values ('listo_para_subir', 'k', 'Tu reel está listo.')",
      )
      expect((await c.query("select 1 from public.avisos where clave = 'k'")).rowCount).toBe(1)
    })
  })
})
