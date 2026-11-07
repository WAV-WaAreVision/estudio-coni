import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"
import { exigirBibliotecaSinPausa } from "@/lib/datos/pausas"
import { filasDePilaresAJson } from "@/lib/datos/pilares"
import { type AutorDeLista, LARGO_DE_AUTOR_NUEVO } from "@/lib/dominio/biblioteca/autores"
import {
  AUTOR_CON_MATERIALES,
  CONI_NO_SE_BORRA,
  hrefTrasBorrar,
  NO_PUDE_BORRAR,
  NO_PUDE_RECUPERAR,
  YA_NO_SE_RECUPERA,
} from "@/lib/dominio/biblioteca/borrado"
import { leerEdicion } from "@/lib/dominio/biblioteca/ficha"
import { ROLES, TIPOS_DE_AUTOR_NUEVO } from "@/lib/dominio/biblioteca/modelo"
import {
  extensionDe,
  FALTA_EL_ARCHIVO,
  GUARDADO_SIN_INICIAR,
  leerEntrada,
  NO_ENCONTRE,
  PESA_DEMASIADO,
  type SubidaFirmada,
  TAMANO_MAXIMO_BYTES,
  tipoDeContenido,
} from "@/lib/dominio/biblioteca/subir"
import { Falla } from "@/lib/dominio/falla"
import { FUERZAS, REDES } from "@/lib/dominio/pilares"
import { type Almacen, claveMaterial } from "@/lib/proveedores/almacen"
import type { Database } from "@/lib/supabase/database.types"
import type { DisparosDeBiblioteca } from "./disparos"
import { aResultado, ERROR_SOLO_CONI, type Resultado } from "./resultado"

type Db = SupabaseClient<Database>

export interface DepsBiblioteca {
  /** Coni's client: row level security applies, and `es_coni` is checked again here (spec A6). */
  db: Db
  disparar: Pick<DisparosDeBiblioteca, "material">
  /** The attempt of each new run (D2): a fresh key, so the failed run is never reused. */
  nuevoId: () => string
  almacen: Pick<Almacen, "urlDeTexto">
}

export const SobreMaterial = z.object({ materialId: z.uuid() })
export const SobreAutor = z.object({ autorId: z.uuid() })
export const EdicionDeMaterial = z.object({ materialId: z.uuid(), autorId: z.uuid(), rol: z.enum(ROLES) })
export const AutorNuevo = z.object({
  nombre: z.string().max(LARGO_DE_AUTOR_NUEVO),
  credencial: z.string().max(LARGO_DE_AUTOR_NUEVO),
  tipo: z.enum(TIPOS_DE_AUTOR_NUEVO),
})
export const UnionDeAutores = z.object({ origen: z.uuid(), destino: z.uuid() })
export const CambioDeIdea = z.object({ id: z.uuid(), oculta: z.boolean() })
export const CambioDePilares = z.object({
  temaId: z.uuid(),
  // A pillar per network, its secondaries and the layers: a handful; 20 is far above any real choice.
  filas: z.array(z.object({ pilar: z.string().min(1).max(80), fuerza: z.enum(FUERZAS).nullable() })).max(20),
})
export const RedElegida = z.object({ red: z.enum(REDES) })

const NO_PUDE_INICIAR = "No pude iniciar el procesamiento. Toca Reintentar en un rato."
const NO_ES_EL_ESTADO = "22023"
const CLAVE_FORANEA = "23503"
const NO_EXISTE = "P0002"
const NO_SE_PUDO_MARCAR = "no_se_pudo_marcar"
const AUTOR_INEXISTENTE = "Ese autor ya no existe."
const IDEA_INEXISTENTE = "Esa idea ya no existe."
const MISMO_AUTOR = "Elige otro autor para unirlos."
const CONI_NO_SE_UNE = "Tu propia ficha no se puede unir a otro autor."
const TEMA_INEXISTENTE = "Ese tema ya no existe. Recarga la página."
const PILAR_QUE_YA_NO_ESTA = "Uno de esos pilares ya no está. Recarga la página y elige de nuevo."
const PILARES_QUE_NO_CALZAN = "Elige un solo pilar por red, y «También toca» solo en una red con pilar."
/** A download link is for one tap. */
const SEGUNDOS_DE_DESCARGA = 5 * 60

/** Row level security lets WAV act on materials (F5); only Coni does it from Conidolly. */
export async function exigirConi(db: Db): Promise<void> {
  const { data, error } = await db.rpc("es_coni")
  if (error) throw new Error(`No pude comprobar quién es: ${error.message}`, { cause: error })
  if (!data) throw new Falla(ERROR_SOLO_CONI)
}

/**
 * Starts the run under a new attempt. When it cannot start, the material gets a reason so it stops polling and can be
 * retried; if even that fails the log says which material is stuck.
 */
async function iniciar(deps: DepsBiblioteca, materialId: string, cuando: string): Promise<void> {
  try {
    await deps.disparar.material(materialId, deps.nuevoId())
  } catch (error) {
    console.error(`No pude iniciar el procesamiento del material ${materialId} al ${cuando}`, error)
    const { error: errorAlMarcar } = await deps.db.rpc("marcar_disparo_fallido", { p_id: materialId })
    if (errorAlMarcar) {
      console.error(`El material ${materialId} quedó procesando sin motivo: no pude marcarlo`, errorAlMarcar)
    }
    throw new Falla(NO_PUDE_INICIAR)
  }
}

/** A material she deleted (marked, waiting for maintenance) is gone for her: acting on it answers not found. */
async function exigirMaterialVisible(db: Db, materialId: string): Promise<void> {
  const { data, error } = await db
    .from("materiales")
    .select("id")
    .eq("id", materialId)
    .is("borrar_desde", null)
    .maybeSingle()
  if (error) throw new Error(`No pude leer el material ${materialId}: ${error.message}`, { cause: error })
  if (!data) throw new Falla(NO_ENCONTRE)
}

type RpcDeMaterial = "reintentar_material" | "reprocesar_material"

/** The database goes first: it is what refuses a second tap. Then the run starts under its own attempt. */
function moverYProcesar(nombre: string, rpc: RpcDeMaterial, siNoCorresponde: string, cuando: string) {
  return (deps: DepsBiblioteca, materialId: string): Promise<Resultado> =>
    aResultado(nombre, async () => {
      await exigirConi(deps.db)
      await exigirBibliotecaSinPausa(deps.db)
      await exigirMaterialVisible(deps.db, materialId)
      const { error } = await deps.db.rpc(rpc, { p_id: materialId })
      if (error) {
        if (error.code === NO_ES_EL_ESTADO) throw new Falla(siNoCorresponde)
        throw new Error(`No pude ${cuando} el material ${materialId}: ${error.message}`, { cause: error })
      }
      await iniciar(deps, materialId, cuando)
      return {}
    })
}

/** A failed material, or one paused with a reason, back to processing. */
export const reintentarMaterial = moverYProcesar(
  "reintentarMaterial",
  "reintentar_material",
  "Ese material ya no se puede reintentar.",
  "reintentar",
)

/** A ready material through the whole process again; `reprocesar_material` drops what the old run derived. */
export const reprocesarMaterial = moverYProcesar(
  "reprocesarMaterial",
  "reprocesar_material",
  "Ese material no se puede reprocesar ahora.",
  "reprocesar",
)

/** Changes who a material is by and who it is for her. The column grants allow only these two. */
export function editarMaterial(deps: DepsBiblioteca, edicion: z.output<typeof EdicionDeMaterial>): Promise<Resultado> {
  return aResultado("editarMaterial", async () => {
    await exigirConi(deps.db)
    const { data, error } = await deps.db
      .from("materiales")
      .update({ autor_id: edicion.autorId, rol: edicion.rol })
      .eq("id", edicion.materialId)
      .is("borrar_desde", null)
      .select("id")
    if (error) {
      if (error.code === CLAVE_FORANEA) throw new Falla("Ese autor ya no existe. Elígelo de nuevo.")
      throw new Error(`No pude cambiar el material ${edicion.materialId}: ${error.message}`, { cause: error })
    }
    if (data.length === 0) throw new Falla(NO_ENCONTRE)
    return {}
  })
}

/** Saves what she changed on a card: only the four fields, validated with her words. */
export function editarFicha(deps: DepsBiblioteca, entrada: unknown): Promise<Resultado> {
  return aResultado("editarFicha", async () => {
    await exigirConi(deps.db)
    const leida = leerEdicion(entrada)
    if (!leida.ok) throw new Falla(leida.error)
    const { materialId, resumen, ideasClave, citas, fuente } = leida.datos
    await exigirMaterialVisible(deps.db, materialId)
    const { data, error } = await deps.db
      .from("fichas")
      .update({ resumen, ideas_clave: ideasClave, citas, fuente })
      .eq("material_id", materialId)
      .select("material_id")
    if (error)
      throw new Error(`No pude guardar la ficha del material ${materialId}: ${error.message}`, { cause: error })
    if (data.length === 0) throw new Falla("Ese material todavía no tiene ficha.")
    return {}
  })
}

/** "Autor nuevo": `crear_autor` answers the existing one when the name or an alias was already taken. */
export function crearAutor(
  deps: Pick<DepsBiblioteca, "db">,
  nuevo: z.output<typeof AutorNuevo>,
): Promise<Resultado<{ autor: AutorDeLista }>> {
  return aResultado("crearAutor", async () => {
    await exigirConi(deps.db)
    const nombre = nuevo.nombre.trim()
    if (nombre === "") throw new Falla("Escribe el nombre del autor.")
    const { data: id, error } = await deps.db.rpc("crear_autor", {
      p_nombre: nombre,
      p_credencial: nuevo.credencial.trim(),
      p_tipo: nuevo.tipo,
    })
    if (error) throw new Error(`No pude crear el autor: ${error.message}`, { cause: error })
    const { data: leido, error: errorDeLectura } = await deps.db
      .from("autores")
      .select("id, nombre, credencial, tipo, alias, borrar_desde")
      .eq("id", id)
      .single()
    if (errorDeLectura)
      throw new Error(`No pude leer el autor ${id}: ${errorDeLectura.message}`, { cause: errorDeLectura })
    const { borrar_desde, ...autor } = leido
    // `crear_autor` answers an author she just deleted when she types its name again: typing it is wanting it back.
    if (borrar_desde !== null) {
      const { error: errorAlRecuperar } = await deps.db.rpc("marcar_autor_para_borrar", { p_id: id, p_borrar: false })
      // Another tab brought it back first: refused, but it already is where she wants it (D4).
      const yaVolvio =
        errorAlRecuperar?.code === NO_ES_EL_ESTADO &&
        errorAlRecuperar.message === NO_SE_PUDO_MARCAR &&
        (await marcaDe(deps.db, "autores", id)) === "visible"
      if (errorAlRecuperar && !yaVolvio) {
        throw new Error(`No pude recuperar el autor ${id}: ${errorAlRecuperar.message}`, { cause: errorAlRecuperar })
      }
    }
    return { autor }
  })
}

/** A five-minute link to the original text (the extraction, never a translation). The file never passes through here. */
export function pedirTextoOriginal(
  deps: Pick<DepsBiblioteca, "db" | "almacen">,
  materialId: string,
): Promise<Resultado<{ url: string }>> {
  return aResultado("pedirTextoOriginal", async () => {
    await exigirConi(deps.db)
    // R2 can outlive the row (a deleted material): only a material she can read through row level security is signed.
    await exigirMaterialVisible(deps.db, materialId)
    const url = await deps.almacen.urlDeTexto(materialId, SEGUNDOS_DE_DESCARGA)
    if (url === null) throw new Falla("Ese texto todavía no está disponible.")
    return { url }
  })
}

/** Uploading a material (batch 2). Its id is new and a UUID: its files' keys live in its own folder. */
export interface DepsSubir {
  /** Coni's client: row level security applies, and `es_coni` is checked again here. */
  db: Db
  almacen: Pick<Almacen, "urlDeSubida" | "tamano" | "borrarCarpeta">
  disparar: Pick<DisparosDeBiblioteca, "material">
  nuevoId: () => string
  ahora: () => Date
}

/** A browser upload link only has to outlast one upload. */
const UNA_HORA_S = 60 * 60

/**
 * Only while it is `procesando`: a material a run already moved on is never taken back. True when the row is gone, so
 * its files may go too.
 */
async function borrarMaterialSinSubir(db: Db, materialId: string): Promise<boolean> {
  const { data, error } = await db
    .from("materiales")
    .delete()
    .eq("id", materialId)
    .eq("estado", "procesando")
    .select("id")
  // The caller answers with the failure that led here; a row left behind is for WAV to find in the log.
  if (error) console.error(`No pude borrar el material ${materialId}`, error)
  return (data ?? []).length > 0
}

/** The files of a deleted material. Its row is already gone, so a folder left behind is for WAV to find in the log. */
async function borrarCarpeta(almacen: Pick<Almacen, "borrarCarpeta">, materialId: string): Promise<void> {
  try {
    await almacen.borrarCarpeta(materialId)
  } catch (error) {
    console.error(`No pude borrar los archivos del material ${materialId}`, error)
  }
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
    await exigirBibliotecaSinPausa(deps.db)
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
        await borrarMaterialSinSubir(deps.db, materialId)
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
          return {
            orden: indice + 1,
            url: await deps.almacen.urlDeSubida(clave, UNA_HORA_S, tipoContenido),
            tipoContenido,
          }
        }),
      )
    } catch (error) {
      await borrarMaterialSinSubir(deps.db, materialId)
      throw new Error(`No pude firmar la subida del material ${materialId}`, { cause: error })
    }
    return { materialId, subidas }
  })
}

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
    await exigirBibliotecaSinPausa(deps.db)
    const subidoPor = await idDeQuienEntro(deps.db)
    const { data: material, error } = await deps.db
      .from("materiales")
      .select("id, estado, archivo_clave")
      .eq("id", materialId)
      .eq("subido_por", subidoPor)
      .is("borrar_desde", null)
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
      if (await borrarMaterialSinSubir(deps.db, materialId)) await borrarCarpeta(deps.almacen, materialId)
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

/** Throws away a material whose upload failed: only hers, and only while it is still `procesando`. */
export function descartarMaterial(
  deps: { db: Db; almacen: Pick<Almacen, "borrarCarpeta"> },
  materialId: string,
): Promise<Resultado> {
  return aResultado("descartarMaterial", async () => {
    await exigirConi(deps.db)
    const subidoPor = await idDeQuienEntro(deps.db)
    const { data, error } = await deps.db
      .from("materiales")
      .delete()
      .eq("id", materialId)
      .eq("subido_por", subidoPor)
      .eq("estado", "procesando")
      .select("id")
    if (error) throw new Error(`No pude descartar el material ${materialId}: ${error.message}`, { cause: error })
    if (data.length > 0) await borrarCarpeta(deps.almacen, materialId)
    return {}
  })
}

/**
 * Joins `origen` into `destino` with `fusionar_autores` (ported from Ingesta's `fusionarAutores`): its materials and
 * ideas pass to the one that stays and it disappears, so Coni's own card is refused here before the database (D7).
 */
export function unirAutores(
  deps: Pick<DepsBiblioteca, "db">,
  union: z.output<typeof UnionDeAutores>,
): Promise<Resultado> {
  return aResultado("unirAutores", async () => {
    await exigirConi(deps.db)
    // A uuid may arrive in either case; the database compares them as the same value.
    if (union.origen.toLowerCase() === union.destino.toLowerCase()) throw new Falla(MISMO_AUTOR)
    const { data: origen, error } = await deps.db
      .from("autores")
      .select("tipo")
      .eq("id", union.origen)
      .is("borrar_desde", null)
      .maybeSingle()
    if (error) throw new Error(`No pude leer el autor ${union.origen}: ${error.message}`, { cause: error })
    if (!origen) throw new Falla(AUTOR_INEXISTENTE)
    if (origen.tipo === "coni") throw new Falla(CONI_NO_SE_UNE)
    // A deleted author waiting for maintenance must not receive materials: it would stay hidden with them.
    const { data: destino, error: errorDeDestino } = await deps.db
      .from("autores")
      .select("id")
      .eq("id", union.destino)
      .is("borrar_desde", null)
      .maybeSingle()
    if (errorDeDestino) {
      throw new Error(`No pude leer el autor ${union.destino}: ${errorDeDestino.message}`, { cause: errorDeDestino })
    }
    if (!destino) throw new Falla(AUTOR_INEXISTENTE)
    const { error: errorDeUnion } = await deps.db.rpc("fusionar_autores", {
      p_origen: union.origen,
      p_destino: union.destino,
    })
    if (errorDeUnion) {
      if (errorDeUnion.code === NO_EXISTE) throw new Falla(AUTOR_INEXISTENTE)
      // Backstops for the checks above, for a row that changed between the two reads.
      if (errorDeUnion.code === NO_ES_EL_ESTADO && errorDeUnion.message === "autores_iguales")
        throw new Falla(MISMO_AUTOR)
      if (errorDeUnion.code === NO_ES_EL_ESTADO && errorDeUnion.message === "autor_coni_protegido") {
        throw new Falla(CONI_NO_SE_UNE)
      }
      throw new Error(`No pude unir el autor ${union.origen} con ${union.destino}: ${errorDeUnion.message}`, {
        cause: errorDeUnion,
      })
    }
    return {}
  })
}

/**
 * Hides or shows an idea with `excluir_afirmacion` (ported from Ingesta's `excluirAfirmacion`). Hiding takes it out of
 * its topic, and a topic left without ideas goes away; shown again it waits without topic for the next maintenance run.
 */
export function ocultarIdea(
  deps: Pick<DepsBiblioteca, "db">,
  cambio: z.output<typeof CambioDeIdea>,
): Promise<Resultado> {
  return aResultado("ocultarIdea", async () => {
    await exigirConi(deps.db)
    const { data: idea, error: errorDeLectura } = await deps.db
      .from("afirmaciones")
      .select("id, materiales!inner ( borrar_desde )")
      .eq("id", cambio.id)
      .is("materiales.borrar_desde", null)
      .maybeSingle()
    if (errorDeLectura) {
      throw new Error(`No pude leer la idea ${cambio.id}: ${errorDeLectura.message}`, { cause: errorDeLectura })
    }
    if (!idea) throw new Falla(IDEA_INEXISTENTE)
    const { error } = await deps.db.rpc("excluir_afirmacion", { p_id: cambio.id, p_excluida: cambio.oculta })
    if (error) {
      if (error.code === NO_EXISTE) throw new Falla(IDEA_INEXISTENTE)
      throw new Error(`No pude cambiar la idea ${cambio.id}: ${error.message}`, { cause: error })
    }
    return {}
  })
}

/** Where the row is now, read when a mark was refused: a refusal can mean it already is where she wants it (D4). */
async function marcaDe(db: Db, tabla: "materiales" | "autores", id: string): Promise<"marcado" | "visible" | null> {
  const { data, error } =
    tabla === "materiales"
      ? await db.from("materiales").select("borrar_desde").eq("id", id).maybeSingle()
      : await db.from("autores").select("borrar_desde").eq("id", id).maybeSingle()
  if (error) throw new Error(`No pude leer ${tabla} ${id}: ${error.message}`, { cause: error })
  if (!data) return null
  return data.borrar_desde === null ? "visible" : "marcado"
}

/** An error she cannot act on is logged for WAV and answered in her words, so the button stays and she tries again. */
function fallaDeMarca(cuando: string, error: { message: string }, paraConi: string): Falla {
  console.error(`No pude ${cuando}`, error)
  return new Falla(paraConi)
}

/**
 * «Borrar material»: marks it, so every screen hides it at once and maintenance deletes it a minute later (spec).
 * Answers the list with the note that offers «Deshacer».
 */
export function borrarMaterial(
  deps: Pick<DepsBiblioteca, "db">,
  materialId: string,
): Promise<Resultado<{ destino: string }>> {
  return aResultado("borrarMaterial", async () => {
    await exigirConi(deps.db)
    const destino = hrefTrasBorrar("material", materialId)
    const { error } = await deps.db.rpc("marcar_material_para_borrar", { p_id: materialId, p_borrar: true })
    if (!error) return { destino }
    if (error.code === NO_ES_EL_ESTADO && error.message === NO_SE_PUDO_MARCAR) {
      const marca = await marcaDe(deps.db, "materiales", materialId)
      if (marca === "marcado") return { destino }
      if (marca === null) throw new Falla(NO_ENCONTRE)
    }
    throw fallaDeMarca(`marcar el material ${materialId}`, error, NO_PUDE_BORRAR)
  })
}

/** «Deshacer»: the material is back where it was, unless maintenance already deleted it. */
export function recuperarMaterial(deps: Pick<DepsBiblioteca, "db">, materialId: string): Promise<Resultado> {
  return aResultado("recuperarMaterial", async () => {
    await exigirConi(deps.db)
    const { error } = await deps.db.rpc("marcar_material_para_borrar", { p_id: materialId, p_borrar: false })
    if (!error) return {}
    if (error.code === NO_ES_EL_ESTADO && error.message === NO_SE_PUDO_MARCAR) {
      const marca = await marcaDe(deps.db, "materiales", materialId)
      if (marca === "visible") return {}
      if (marca === null) throw new Falla(YA_NO_SE_RECUPERA)
    }
    throw fallaDeMarca(`recuperar el material ${materialId}`, error, NO_PUDE_RECUPERAR)
  })
}

/** «Borrar autor»: only with nothing live by or from it, never Coni's card (the page offers it only then). */
export function borrarAutor(
  deps: Pick<DepsBiblioteca, "db">,
  autorId: string,
): Promise<Resultado<{ destino: string }>> {
  return aResultado("borrarAutor", async () => {
    await exigirConi(deps.db)
    const destino = hrefTrasBorrar("autor", autorId)
    const { error } = await deps.db.rpc("marcar_autor_para_borrar", { p_id: autorId, p_borrar: true })
    if (!error) return { destino }
    if (error.code === NO_ES_EL_ESTADO) {
      // Backstops for the page's own check, for a row that changed after the page was drawn.
      if (error.message === "autor_con_materiales") throw new Falla(AUTOR_CON_MATERIALES)
      if (error.message === "autor_coni_protegido") throw new Falla(CONI_NO_SE_BORRA)
      if (error.message === NO_SE_PUDO_MARCAR) {
        const marca = await marcaDe(deps.db, "autores", autorId)
        if (marca === "marcado") return { destino }
        if (marca === null) throw new Falla(AUTOR_INEXISTENTE)
      }
    }
    throw fallaDeMarca(`marcar el autor ${autorId}`, error, NO_PUDE_BORRAR)
  })
}

/** «Deshacer» for an author. */
export function recuperarAutor(deps: Pick<DepsBiblioteca, "db">, autorId: string): Promise<Resultado> {
  return aResultado("recuperarAutor", async () => {
    await exigirConi(deps.db)
    const { error } = await deps.db.rpc("marcar_autor_para_borrar", { p_id: autorId, p_borrar: false })
    if (!error) return {}
    if (error.code === NO_ES_EL_ESTADO && error.message === NO_SE_PUDO_MARCAR) {
      const marca = await marcaDe(deps.db, "autores", autorId)
      if (marca === "visible") return {}
      if (marca === null) throw new Falla(YA_NO_SE_RECUPERA)
    }
    throw fallaDeMarca(`recuperar el autor ${autorId}`, error, NO_PUDE_RECUPERAR)
  })
}

/**
 * Replaces a topic's pillars with Coni's (spec 2026-11-04, part 15a, section 5) through `cambiar_pilares_de_tema`,
 * which checks every row. The form never sends a broken choice; the database's refusals are the backstop.
 */
export function cambiarPilaresDeTema(
  deps: Pick<DepsBiblioteca, "db">,
  cambio: z.output<typeof CambioDePilares>,
): Promise<Resultado> {
  return aResultado("cambiarPilaresDeTema", async () => {
    await exigirConi(deps.db)
    const { error } = await deps.db.rpc("cambiar_pilares_de_tema", {
      p_tema: cambio.temaId,
      p_filas: filasDePilaresAJson(cambio.filas),
    })
    if (error) {
      if (error.code === NO_EXISTE && error.message === "tema_inexistente") throw new Falla(TEMA_INEXISTENTE)
      if (error.code === NO_EXISTE) throw new Falla(PILAR_QUE_YA_NO_ESTA)
      if (error.code === NO_ES_EL_ESTADO) throw new Falla(PILARES_QUE_NO_CALZAN)
      throw new Error(`No pude cambiar los pilares del tema ${cambio.temaId}: ${error.message}`, { cause: error })
    }
    return {}
  })
}

/**
 * The network Temas showed, so it opens there next time (spec 2026-11-04, part 15b). Written like every setting,
 * through the policy "coni edita ajustes"; row level security answers "no rows" to anybody else, which is an error.
 */
export function recordarRed(
  deps: Pick<DepsBiblioteca, "db">,
  elegida: z.output<typeof RedElegida>,
): Promise<Resultado> {
  return aResultado("recordarRed", async () => {
    await exigirConi(deps.db)
    const { data, error } = await deps.db
      .from("ajustes")
      .update({ ultima_red: elegida.red })
      .eq("id", true)
      .select("ultima_red")
      .maybeSingle()
    if (error) throw new Error(`No pude recordar la red ${elegida.red}: ${error.message}`, { cause: error })
    if (!data) throw new Error("La base no guardó la red de Temas.")
    return {}
  })
}
