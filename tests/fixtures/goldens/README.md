# Subtitle goldens

`guion.txt`, `subtitulos.srt` (from HeyGen) and `subtitulos.ass` (from `scripts/coni.py`) of the two
reels published before the platform, copied from `coni-heygen` at commit `4b3ec17`.
`tests/unit/subtitulos-goldens.test.ts` requires the TypeScript port to produce the same `.ass`
except the `Style:` line (Montserrat instead of Avenir Next).

To regenerate after an intentional format change, run in `coni-heygen`:

    python3 scripts/coni.py subtitulos contenido/<reel>

and copy the new `subtitulos.ass` here, explaining the change in the commit message.
