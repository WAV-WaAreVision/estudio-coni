// The public API of the Claude provider. Each task family lives in its own module under ./anthropic/ (issue #16), so
// a task's prompt can change without touching the others; importers keep this one path.
export {
  type AfirmacionExtraida,
  EVIDENCIAS_DE_AFIRMACION,
  extraerAfirmaciones,
  MAXIMO_AFIRMACIONES_POR_TRAMO,
  MAXIMO_CARACTERES_DE_AFIRMACION,
  TIPOS_DE_AFIRMACION,
  VERSION_DE_EXTRACCION,
} from "./anthropic/afirmaciones"
export {
  acortarLaminas,
  type CambioDeCarrusel,
  escribirCarrusel,
  revisarCarruselConClaude,
  SalidaAcortado,
  SalidaCarrusel,
} from "./anthropic/carrusel"
export { escribirFicha, type FichaEscrita, MAXIMO_CARACTERES_PARA_FICHA } from "./anthropic/ficha"
export { escribirGuion, revisarConClaude } from "./anthropic/guion"
export {
  clasificarEnPilares,
  clasificarIdea,
  guiaDeReclasificacion,
  type PropuestaDeIdea,
  pedidoDeReclasificacion,
} from "./anthropic/ideas"
export { leerTextoEnImagenes, type TextoLeido } from "./anthropic/lectura"
export {
  cobroDeFalla,
  costoClaude,
  MODELO_POR_TAREA,
  type ModeloClaude,
  modeloQueCobra,
  RechazoDeClaude,
  RespuestaCortada,
  sinRaya,
  type UsoClaude,
} from "./anthropic/nucleo"
export {
  guiaDePilaresPorRed,
  type IdeaPorClasificar,
  type PropuestaDeIdeaPorRed,
  type PropuestaDeTema,
  pedidoDePilaresPorRed,
  proponerPilaresPorRed,
  type TemaPorClasificar,
} from "./anthropic/pilares"
export type { IdeaParaGuion, RespaldoParaGuion } from "./anthropic/secciones"
export {
  confirmarFusiones,
  type GrupoPorNombrar,
  MAXIMO_PARES_POR_FUSION,
  nombrarTemas,
  type ParParaFusionar,
  type TemaNombrado,
  type TemaParaFusionar,
} from "./anthropic/temas"
export {
  type ContextoDeTeorias,
  type CruceParaTeoria,
  escribirTeorias,
  MAXIMO_IDEAS_POR_TEORIA,
  type ResultadoDeValidacion,
  type SalidaDeTeoria,
  type TeoriaDelMotor,
  validarTeoria,
} from "./anthropic/teorias"
