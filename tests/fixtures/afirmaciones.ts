import type { AfirmacionLeida, MarcaLeida } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { catalogoDeFilas } from "@/lib/dominio/biblioteca/etiquetas-de-afirmacion"
import { FILAS_DE_VOCABULARIO } from "./vocabulario"

/** The starting lists of 20261114000100_vocabularios.sql, every value active. */
export const CATALOGO_DE_PRUEBA = catalogoDeFilas(FILAS_DE_VOCABULARIO)

export const ID_DE_AFIRMACION = "11111111-2222-4333-8444-555555555555"
export const ID_DE_MATERIAL = "22222222-3333-4444-8555-666666666666"
export const ID_DE_AUTORA = "33333333-4444-4555-8666-777777777777"
export const ID_DE_TEMA = "44444444-5555-4666-8777-888888888888"
export const MARCA_EMOCION_LINKEDIN = "aaaaaaaa-0000-4000-8000-000000000001"
export const MARCA_EMOCION_INSTAGRAM = "aaaaaaaa-0000-4000-8000-000000000002"
export const MARCA_DATO = "aaaaaaaa-0000-4000-8000-000000000003"

export function marcaDePrueba(extra: Partial<MarcaLeida> = {}): MarcaLeida {
  return {
    id: MARCA_EMOCION_LINKEDIN,
    marca: "emocion",
    red: "linkedin",
    valor: "escepticismo",
    frase: "No me lo creo",
    certeza: "baja",
    porQue: null,
    origen: "extraccion",
    ...extra,
  }
}

/** A new claim as 6a's extraction leaves it: two emotions, a dato and a hook; no correction yet. */
export function afirmacionDePrueba(extra: Partial<AfirmacionLeida> = {}): AfirmacionLeida {
  return {
    id: ID_DE_AFIRMACION,
    texto: "El aislamiento pesa más que las horas extra.",
    cita: "El aislamiento pesa más que las horas extra, según la revisión.",
    tipo: "dato",
    evidencia: "estudio",
    ubicacion: { pagina: 3 },
    material: { id: ID_DE_MATERIAL, titulo: "Burnout y teletrabajo" },
    autor: { id: ID_DE_AUTORA, nombre: "Daniela Ruiz" },
    tema: { id: ID_DE_TEMA, nombre: "Carga mental" },
    textoAntiguo: { publico: null, dolor: null, emocion: null, gancho: null },
    marcas: [
      marcaDePrueba(),
      marcaDePrueba({
        id: MARCA_EMOCION_INSTAGRAM,
        red: "instagram",
        valor: "curiosidad",
        frase: "Abre la pregunta",
        certeza: "media",
      }),
      marcaDePrueba({
        id: MARCA_DATO,
        marca: "dato",
        red: "todas",
        valor: "70 %",
        frase: "El 70 % trabaja solo",
        certeza: "alta",
      }),
    ],
    gancho: {
      fraseExacta: "El aislamiento pesa más que las horas extra.",
      fraseSinGancho: "El aislamiento cansa más que el trabajo.",
      tipo: "verdad_incomoda",
      certeza: "media",
      origen: "extraccion",
    },
    correcciones: [],
    ...extra,
  }
}

/** A claim from before 6a: no marks and no hook row, only the old free text. */
export const afirmacionAntiguaDePrueba = (): AfirmacionLeida =>
  afirmacionDePrueba({
    marcas: [],
    gancho: null,
    textoAntiguo: {
      publico: "Parejas que trabajan",
      dolor: "La carga invisible",
      emocion: "Alivio",
      gancho: "¿Y si la pausa fuera parte del trabajo?",
    },
  })
