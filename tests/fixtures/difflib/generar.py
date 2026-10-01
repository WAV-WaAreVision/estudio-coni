"""Regenerates casos.json, the golden fixture for tests/unit/secuencias-fixture.test.ts.

Each case is a pair of words over a small alphabet (so repeats and ties between equally long
matches are common) together with what Python's difflib.SequenceMatcher(None, a, b,
autojunk=False) returns for it: ratio() and get_opcodes().

Regenerate from the repo root (this script is stdlib only):

    python3 tests/fixtures/difflib/generar.py
    pnpm exec biome format --write tests/fixtures/difflib/casos.json

The second command is needed because `pnpm lint` rejects the compact JSON written here; Biome only
changes whitespace. casos.json currently comes from Python 3.12.13 (`python3 --version`). The seed
is fixed, so the output only changes if difflib's behaviour or Python's random sequence changes.
"""

import difflib
import json
import random
from pathlib import Path

SEMILLA = 20261001
CASOS = 200
LARGO_MAXIMO = 10
LETRAS = "abcdef"


def palabra(alfabeto: str) -> str:
    return "".join(random.choice(alfabeto) for _ in range(random.randint(0, LARGO_MAXIMO)))


def main() -> None:
    random.seed(SEMILLA)
    casos = []
    for _ in range(CASOS):
        alfabeto = LETRAS[: random.randint(2, len(LETRAS))]
        a, b = palabra(alfabeto), palabra(alfabeto)
        matcher = difflib.SequenceMatcher(None, list(a), list(b), autojunk=False)
        casos.append({"a": a, "b": b, "ratio": matcher.ratio(), "opcodes": matcher.get_opcodes()})
    destino = Path(__file__).with_name("casos.json")
    destino.write_text(json.dumps(casos, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(casos)} casos en {destino}")


if __name__ == "__main__":
    main()
