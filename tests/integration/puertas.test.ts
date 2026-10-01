import { afterAll, describe, expect, it } from "vitest"
import { asumir, CONI, como, comoConi, comoMantenedor, comoPostgres, comoServicio, fallaCon, OTRA, pool } from "./db"
import { actualizar, aplicar, crearPieza, crearPiezaEn, leer, TEXTO, VIDEO } from "./flujo"

afterAll(() => pool.end())

const aprobarPuerta1 = {
  puerta1_hash: "h".repeat(64),
  puerta1_en: new Date().toISOString(),
}
const aprobarPuerta2 = {
  puerta2_video_id: VIDEO,
  puerta2_hash_texto: "t".repeat(64),
  puerta2_publicar_en: new Date(Date.now() + 86_400_000).toISOString(),
  puerta2_en: new Date().toISOString(),
}

describe("recorrido completo", () => {
  it("llega a publicado cuando cada actor escribe solo lo que le toca", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "publicado")
      const fila = await leer(c, id)
      expect(fila.estado).toBe("publicado")
      expect(fila.version).toBe(7)
      expect(fila.puerta1_por).toBe(CONI)
      expect(fila.puerta2_por).toBe(CONI)
      expect(fila.puerta2_video_id).toBe(VIDEO)
    })
  })
})

describe("quién aprueba", () => {
  it("rechaza la puerta 1 cuando la escribe el servicio", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoServicio)
      const err = await fallaCon(
        c,
        "update public.piezas set puerta1_hash = $2, puerta1_en = $3, version = version + 1 where id = $1",
        [id, aprobarPuerta1.puerta1_hash, aprobarPuerta1.puerta1_en],
      )
      expect(err.code).toBe("42501")
      expect(err.message).toBe("solo_coni_aprueba")
    })
  })

  it("rechaza la puerta 2 cuando la escribe el servicio", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "video_por_aprobar")
      await asumir(c, comoServicio)
      const err = await fallaCon(
        c,
        `update public.piezas set puerta2_video_id = $2, puerta2_hash_texto = $3, puerta2_publicar_en = $4,
           puerta2_en = $5, puerta2_por = $6, version = version + 1 where id = $1`,
        [
          id,
          aprobarPuerta2.puerta2_video_id,
          aprobarPuerta2.puerta2_hash_texto,
          aprobarPuerta2.puerta2_publicar_en,
          aprobarPuerta2.puerta2_en,
          CONI,
        ],
      )
      expect(err.code).toBe("42501")
      expect(err.message).toBe("solo_coni_aprueba")
    })
  })

  it("rechaza la puerta 1 cuando escribe postgres sin sesión", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoPostgres)
      const err = await fallaCon(
        c,
        "update public.piezas set puerta1_hash = $2, puerta1_en = $3, version = version + 1 where id = $1",
        [id, aprobarPuerta1.puerta1_hash, aprobarPuerta1.puerta1_en],
      )
      expect(err.code).toBe("42501")
      expect(err.message).toBe("solo_coni_aprueba")
    })
  })

  it("rechaza la puerta 2 cuando escribe postgres sin sesión", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "video_por_aprobar")
      await asumir(c, comoPostgres)
      const err = await fallaCon(
        c,
        `update public.piezas set puerta2_video_id = $2, puerta2_hash_texto = $3, puerta2_publicar_en = $4,
           puerta2_en = $5, version = version + 1 where id = $1`,
        [
          id,
          aprobarPuerta2.puerta2_video_id,
          aprobarPuerta2.puerta2_hash_texto,
          aprobarPuerta2.puerta2_publicar_en,
          aprobarPuerta2.puerta2_en,
        ],
      )
      expect(err.code).toBe("42501")
      expect(err.message).toBe("solo_coni_aprueba")
    })
  })

  it("rechaza mover la hora aprobada cuando la cambia el servicio", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado")
      await asumir(c, comoServicio)
      const err = await fallaCon(
        c,
        "update public.piezas set puerta2_publicar_en = puerta2_publicar_en + interval '1 day', version = version + 1 where id = $1",
        [id],
      )
      expect(err.code).toBe("42501")
      expect(err.message).toBe("solo_coni_aprueba")
    })
  })

  it("rechaza cambiar el texto aprobado cuando lo cambia el servicio", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado")
      await asumir(c, comoServicio)
      const err = await fallaCon(
        c,
        "update public.piezas set puerta2_hash_texto = $2, version = version + 1 where id = $1",
        [id, "f".repeat(64)],
      )
      expect(err.code).toBe("42501")
      expect(err.message).toBe("solo_coni_aprueba")
    })
  })

  it("no actualiza nada cuando el mantenedor intenta aprobar", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoMantenedor)
      const { rowCount } = await actualizar(c, id, 2, { ...aprobarPuerta1, version: 3, estado: "en_render" })
      expect(rowCount).toBe(0)
      await asumir(c, comoPostgres)
      const fila = await leer(c, id)
      expect(fila.estado).toBe("guion_por_aprobar")
      expect(fila.puerta1_hash).toBeNull()
    })
  })

  it("guarda a coni como quien aprobó la puerta 1 aunque se envíe otro uuid", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      const { rows } = await c.query(
        `update public.piezas set puerta1_hash = $2, puerta1_en = $3, puerta1_por = $4, estado = 'en_render',
           version = version + 1 where id = $1 returning puerta1_por`,
        [id, aprobarPuerta1.puerta1_hash, aprobarPuerta1.puerta1_en, OTRA],
      )
      expect(rows[0].puerta1_por).toBe(CONI)
    })
  })

  it("guarda a coni como quien aprobó la puerta 2 aunque se envíe otro uuid", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "video_por_aprobar")
      await asumir(c, comoConi)
      const { rows } = await c.query(
        `update public.piezas set puerta2_video_id = $2, puerta2_hash_texto = $3, puerta2_publicar_en = $4,
           puerta2_en = $5, puerta2_por = $6, estado = 'programado', version = version + 1
         where id = $1 returning puerta2_por`,
        [
          id,
          aprobarPuerta2.puerta2_video_id,
          aprobarPuerta2.puerta2_hash_texto,
          aprobarPuerta2.puerta2_publicar_en,
          aprobarPuerta2.puerta2_en,
          OTRA,
        ],
      )
      expect(rows[0].puerta2_por).toBe(CONI)
    })
  })

  it("conserva quién aprobó cuando una escritura intenta reemplazar puerta1_por", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      await asumir(c, comoServicio)
      const { rows } = await c.query(
        "update public.piezas set puerta1_por = $2, version = version + 1 where id = $1 returning puerta1_por",
        [id, OTRA],
      )
      expect(rows[0].puerta1_por).toBe(CONI)
    })
  })

  it("rechaza una aprobación incompleta cuando coni escribe solo el hash", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      const err = await fallaCon(c, "update public.piezas set puerta1_hash = $2, version = version + 1 where id = $1", [
        id,
        aprobarPuerta1.puerta1_hash,
      ])
      expect(err.code).toBe("23514")
      expect(err.constraint).toBe("puerta1_completa")
    })
  })
})

describe("quién entra a las puertas", () => {
  it("rechaza entrar a en_render cuando el servicio lo hace con el hash conservado", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      await asumir(c, comoServicio)
      // Leaves the gate state keeping the approval (a stale row the task did not clean up).
      await c.query("update public.piezas set estado = 'guion_por_aprobar', version = version + 1 where id = $1", [id])
      const err = await fallaCon(
        c,
        "update public.piezas set estado = 'en_render', version = version + 1 where id = $1",
        [id],
      )
      expect(err.code).toBe("42501")
      expect(err.message).toBe("solo_coni_entra_a_puerta")
    })
  })

  it("rechaza entrar a programado cuando el servicio lo hace con la puerta 2 conservada", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado")
      await asumir(c, comoServicio)
      await c.query("update public.piezas set estado = 'video_por_aprobar', version = version + 1 where id = $1", [id])
      const err = await fallaCon(
        c,
        "update public.piezas set estado = 'programado', version = version + 1 where id = $1",
        [id],
      )
      expect(err.code).toBe("42501")
      expect(err.message).toBe("solo_coni_entra_a_puerta")
    })
  })

  it("rechaza entrar a en_render cuando escribe postgres sin sesión", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      await asumir(c, comoPostgres)
      await c.query("update public.piezas set estado = 'guion_por_aprobar', version = version + 1 where id = $1", [id])
      const err = await fallaCon(
        c,
        "update public.piezas set estado = 'en_render', version = version + 1 where id = $1",
        [id],
      )
      expect(err.code).toBe("42501")
      expect(err.message).toBe("solo_coni_entra_a_puerta")
    })
  })

  it("deja a coni volver a en_render cuando regraba un video", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "video_por_aprobar")
      const fila = await aplicar(c, id, comoConi, { tipo: "regrabar" })
      expect(fila.estado).toBe("en_render")
      expect(fila.intento).toBe(1)
    })
  })
})

describe("invalidar aprobaciones", () => {
  it("deja al servicio borrar la puerta 1 cuando la política de contenido rechaza el guion", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "en_render")
      const fila = await aplicar(c, id, comoServicio, { tipo: "politica_contenido", explicacion: "Revisar el tema" })
      expect(fila.estado).toBe("guion_por_aprobar")
      expect(fila.puerta1_hash).toBeNull()
      expect(fila.puerta1_por).toBeNull()
    })
  })

  it("deja al servicio borrar la puerta 2 cuando la hora aprobada venció", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado")
      const fila = await aplicar(c, id, comoServicio, { tipo: "hora_vencida" })
      expect(fila.estado).toBe("video_por_aprobar")
      expect(fila.puerta2_hash_texto).toBeNull()
      expect(fila.puerta2_por).toBeNull()
      expect(fila.puerta1_por).toBe(CONI)
    })
  })

  it("deja a coni cambiar el texto de una pieza programada y borra la puerta 2", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "programado")
      const fila = await aplicar(c, id, comoConi, { tipo: "editar_texto" }, { texto: `${TEXTO} Editado.` })
      expect(fila.estado).toBe("video_por_aprobar")
      expect(fila.puerta2_por).toBeNull()
    })
  })
})

describe("versión", () => {
  it("rechaza la escritura cuando no sube la versión", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      await asumir(c, comoServicio)
      const err = await fallaCon(c, "update public.piezas set titulo = 'x' where id = $1", [id])
      expect(err.code).toBe("40001")
      expect(err.message).toBe("version_desfasada")
    })
  })

  it("rechaza la escritura cuando la versión salta dos", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      await asumir(c, comoConi)
      const err = await fallaCon(c, "update public.piezas set titulo = 'x', version = version + 2 where id = $1", [id])
      expect(err.code).toBe("40001")
    })
  })

  it("rechaza la escritura cuando la versión retrocede", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_en_proceso")
      await asumir(c, comoServicio)
      const err = await fallaCon(c, "update public.piezas set version = 0 where id = $1", [id])
      expect(err.code).toBe("40001")
    })
  })

  it("rechaza la versión desfasada también cuando escribe postgres", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      const err = await fallaCon(c, "update public.piezas set titulo = 'x', version = 5 where id = $1", [id])
      expect(err.code).toBe("40001")
    })
  })

  it("no actualiza nada cuando la versión leída ya quedó vieja", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPieza(c)
      await asumir(c, comoConi)
      const primera = await actualizar(c, id, 0, { titulo: "primero", version: 1 })
      const segunda = await actualizar(c, id, 0, { titulo: "segundo", version: 1 })
      expect(primera.rowCount).toBe(1)
      expect(segunda.rowCount).toBe(0)
      expect((await leer(c, id)).version).toBe(1)
    })
  })
})

describe("piezas nuevas", () => {
  it("rechaza una pieza nueva cuando la versión no es cero", async () => {
    await como(comoConi, async (c) => {
      const err = await fallaCon(c, "insert into public.piezas (titulo, version) values ('x', 3)")
      expect(err.code).toBe("42501")
      expect(err.message).toBe("pieza_nueva_invalida")
    })
  })

  it("rechaza una pieza nueva cuando trae la puerta 1 aprobada", async () => {
    await como(comoServicio, async (c) => {
      const err = await fallaCon(
        c,
        "insert into public.piezas (titulo, puerta1_hash, puerta1_en, puerta1_por) values ('x', $1, now(), $2)",
        [aprobarPuerta1.puerta1_hash, CONI],
      )
      expect(err.code).toBe("42501")
      expect(err.message).toBe("pieza_nueva_invalida")
    })
  })

  it("rechaza una pieza nueva cuando trae la puerta 2 aprobada", async () => {
    await como(comoPostgres, async (c) => {
      const err = await fallaCon(
        c,
        `insert into public.piezas (titulo, puerta2_video_id, puerta2_hash_texto, puerta2_publicar_en, puerta2_en, puerta2_por)
         values ('x', 'v', $1, now(), now(), $2)`,
        [aprobarPuerta2.puerta2_hash_texto, CONI],
      )
      expect(err.code).toBe("42501")
      expect(err.message).toBe("pieza_nueva_invalida")
    })
  })
})

describe("restricciones de estado", () => {
  it("rechaza programado sin puerta 2 cuando coni lo fuerza", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "video_por_aprobar")
      await asumir(c, comoConi)
      const err = await fallaCon(
        c,
        "update public.piezas set estado = 'programado', version = version + 1 where id = $1",
        [id],
      )
      expect(err.code).toBe("23514")
      expect(err.constraint).toBe("aprobada_para_publicar")
    })
  })

  it("rechaza en_render sin puerta 1 cuando coni lo fuerza", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_por_aprobar")
      await asumir(c, comoConi)
      const err = await fallaCon(
        c,
        "update public.piezas set estado = 'en_render', version = version + 1 where id = $1",
        [id],
      )
      expect(err.code).toBe("23514")
      expect(err.constraint).toBe("aprobada_para_grabar")
    })
  })

  it("rechaza un estado de error sin el estado de origen cuando falta", async () => {
    await como(comoPostgres, async (c) => {
      const id = await crearPiezaEn(c, "guion_en_proceso")
      const err = await fallaCon(
        c,
        "update public.piezas set estado = 'error_produccion', version = version + 1 where id = $1",
        [id],
      )
      expect(err.code).toBe("23514")
      expect(err.constraint).toBe("error_con_origen")
    })
  })
})
