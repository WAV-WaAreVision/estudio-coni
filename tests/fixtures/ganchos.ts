import { type GanchoDeLista, type TipoDeGancho, tiposDeGancho } from "@/lib/dominio/biblioteca/ganchos"
import { FILAS_DE_VOCABULARIO } from "./vocabulario"

const VALORES_DE_GANCHO = FILAS_DE_VOCABULARIO.find((fila) => fila.lista === "gancho")?.valores ?? []

/** The twelve starting types plus one retired, «Rima». */
export const TIPOS_DE_PRUEBA: TipoDeGancho[] = tiposDeGancho([
  ...VALORES_DE_GANCHO,
  { valor: "rima", etiqueta: "Rima", retirado: true },
])

export const ID_DE_GANCHO = "11111111-2222-4333-8444-555555555555"
export const PILAR_DE_LINKEDIN = "55555555-6666-4777-8888-999999999999"
export const PILAR_DE_INSTAGRAM = "66666666-7777-4888-8999-aaaaaaaaaaaa"

export function ganchoDePrueba(extra: Partial<GanchoDeLista> = {}): GanchoDeLista {
  return {
    afirmacionId: ID_DE_GANCHO,
    fraseExacta: "El 70 % no descansa.",
    fraseSinGancho: "Pocas personas descansan.",
    tipo: "numero_especifico",
    certeza: "alta",
    clasificado: true,
    creadoEn: "2026-11-20T10:00:00+00:00",
    material: { id: "22222222-3333-4444-8555-666666666666", titulo: "Burnout y teletrabajo" },
    ubicacion: { pagina: 3 },
    autor: { id: "33333333-4444-4555-8666-777777777777", nombre: "Daniela Ruiz" },
    tema: { id: "44444444-5555-4666-8777-888888888888", nombre: "Carga mental" },
    pilares: [{ red: "linkedin", pilarId: PILAR_DE_LINKEDIN, nombre: "Bienestar e impacto" }],
    favorito: false,
    ...extra,
  }
}
