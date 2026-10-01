# Subtitle goldens

`guion.txt`, `subtitulos.srt` (from HeyGen) and `subtitulos.ass` (from `scripts/coni.py`) of the two
reels published before the platform, copied from `coni-heygen` at commit `4b3ec17`.
`tests/unit/subtitulos-goldens.test.ts` requires the TypeScript port to produce the same `.ass`
except the font in the `Style:` line (Montserrat instead of Avenir Next).

Do not edit these files by hand. If the golden test fails, fix the port. To regenerate after an
intentional format change, run this in `coni-heygen` (it reads the committed `guion.txt` and
`subtitulos.srt`; `coni.py subtitulos` would need the video and may re-download the SRT):

```bash
reel=2026-09-30-deseo-se-esconde
python3 - "$reel" > "contenido/$reel/subtitulos.ass" <<'PY'
import importlib.util, pathlib, sys
spec = importlib.util.spec_from_file_location("coni", "scripts/coni.py")
coni = importlib.util.module_from_spec(spec)
spec.loader.exec_module(coni)
carpeta = pathlib.Path("contenido") / sys.argv[1]
srt = (carpeta / "subtitulos.srt").read_text(encoding="utf-8")
print(coni.ass_de(coni.alinear_con_guion(coni.leer_srt(srt), coni.leer_guion(carpeta))), end="")
PY
```

then copy `guion.txt`, `subtitulos.srt` and `subtitulos.ass` here together and explain the change in
the commit message.
