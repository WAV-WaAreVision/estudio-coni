import { describe, expect, it } from "vitest"
import { compararSecuencias, type Opcode } from "@/lib/dominio/secuencias"

// Produced by Python 3: difflib.SequenceMatcher(None, a, b, autojunk=False).ratio() / .get_opcodes()
const CASOS: { a: string[]; b: string[]; ratio: number; opcodes: Opcode[] }[] = [
  {
    a: ["hola", "hola", "a", "todas"],
    b: ["hola", "a", "todas"],
    ratio: 0.8571428571428571,
    opcodes: [
      ["delete", 0, 1, 0, 0],
      ["equal", 1, 4, 0, 3],
    ],
  },
  {
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
  { a: ["a", "b", "c"], b: ["x", "y"], ratio: 0, opcodes: [["replace", 0, 3, 0, 2]] },
  {
    a: ["a", "b", "a", "b", "c"],
    b: ["b", "a", "b", "c", "a"],
    ratio: 0.8,
    opcodes: [
      ["delete", 0, 1, 0, 0],
      ["equal", 1, 5, 0, 4],
      ["insert", 5, 5, 4, 5],
    ],
  },
  { a: [], b: ["a"], ratio: 0, opcodes: [["insert", 0, 0, 0, 1]] },
  { a: [], b: [], ratio: 1, opcodes: [] },
]

describe("compararSecuencias", () => {
  it.each(CASOS)(
    "da el mismo ratio y las mismas operaciones que difflib cuando a=$a y b=$b",
    ({ a, b, ratio, opcodes }) => {
      const resultado = compararSecuencias(a, b)
      expect(resultado.ratio).toBe(ratio)
      expect(resultado.opcodes).toEqual(opcodes)
    },
  )
})
