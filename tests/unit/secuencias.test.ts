import { describe, expect, it } from "vitest"
import { compararSecuencias, type Opcode } from "@/lib/dominio/secuencias"

// Expected values produced by Python 3.12.13:
// difflib.SequenceMatcher(None, a, b, autojunk=False).ratio() / .get_opcodes()
// The cases at the end pin tie-breaking between equally long matches and the [blo, bhi) window.
const CASOS: { nombre: string; a: string[]; b: string[]; ratio: number; opcodes: Opcode[] }[] = [
  {
    nombre: "borra la palabra repetida",
    a: ["hola", "hola", "a", "todas"],
    b: ["hola", "a", "todas"],
    ratio: 0.8571428571428571,
    opcodes: [
      ["delete", 0, 1, 0, 0],
      ["equal", 1, 4, 0, 3],
    ],
  },
  {
    nombre: "corrige dos palabras mal transcritas",
    a: ["te", "cuesta", "sentirte", "la", "es", "súper", "común", "dudar", "de", "soy", "coni", "del", "rosario"],
    b: ["te", "cuesta", "sentirte", "la", "es", "supercomún", "dudar", "de", "soy", "connie", "del", "rosario"],
    ratio: 0.8,
    opcodes: [
      ["equal", 0, 5, 0, 5],
      ["replace", 5, 7, 5, 6],
      ["equal", 7, 10, 6, 9],
      ["replace", 10, 11, 9, 10],
      ["equal", 11, 13, 10, 12],
    ],
  },
  { nombre: "sin nada en común", a: ["a", "b", "c"], b: ["x", "y"], ratio: 0, opcodes: [["replace", 0, 3, 0, 2]] },
  {
    nombre: "desplazadas una posición",
    a: ["a", "b", "a", "b", "c"],
    b: ["b", "a", "b", "c", "a"],
    ratio: 0.8,
    opcodes: [
      ["delete", 0, 1, 0, 0],
      ["equal", 1, 5, 0, 4],
      ["insert", 5, 5, 4, 5],
    ],
  },
  { nombre: "a vacía", a: [], b: ["a"], ratio: 0, opcodes: [["insert", 0, 0, 0, 1]] },
  { nombre: "las dos vacías", a: [], b: [], ratio: 1, opcodes: [] },
  {
    nombre: "empate en largo: gana el primero de a",
    a: "xyzxy".split(""),
    b: "xy".split(""),
    ratio: 0.5714285714285714,
    opcodes: [
      ["equal", 0, 2, 0, 2],
      ["delete", 2, 5, 2, 2],
    ],
  },
  {
    nombre: "empate en a: gana el primero de b",
    a: "a".split(""),
    b: "aa".split(""),
    ratio: 0.6666666666666666,
    opcodes: [
      ["equal", 0, 1, 0, 1],
      ["insert", 1, 1, 1, 2],
    ],
  },
  {
    nombre: "empate cruzado: manda el orden de a",
    a: "abcde".split(""),
    b: "cdabe".split(""),
    ratio: 0.6,
    opcodes: [
      ["insert", 0, 0, 0, 2],
      ["equal", 0, 2, 2, 4],
      ["delete", 2, 4, 4, 4],
      ["equal", 4, 5, 4, 5],
    ],
  },
  {
    nombre: "respeta el límite inferior de b",
    a: "aa".split(""),
    b: "ab".split(""),
    ratio: 0.5,
    opcodes: [
      ["equal", 0, 1, 0, 1],
      ["replace", 1, 2, 1, 2],
    ],
  },
  {
    nombre: "respeta el límite superior de b",
    a: "aba".split(""),
    b: "bba".split(""),
    ratio: 0.6666666666666666,
    opcodes: [
      ["replace", 0, 1, 0, 1],
      ["equal", 1, 3, 1, 3],
    ],
  },
  {
    nombre: "reinicia el largo después de un hueco",
    a: "afa".split(""),
    b: "aa".split(""),
    ratio: 0.8,
    opcodes: [
      ["equal", 0, 1, 0, 1],
      ["delete", 1, 2, 1, 1],
      ["equal", 2, 3, 1, 2],
    ],
  },
]

describe("compararSecuencias", () => {
  it.each(CASOS)(
    "da el mismo ratio y las mismas operaciones que difflib cuando $nombre",
    ({ a, b, ratio, opcodes }) => {
      const resultado = compararSecuencias(a, b)
      expect(resultado.ratio).toBe(ratio)
      expect(resultado.opcodes).toEqual(opcodes)
    },
  )
})
