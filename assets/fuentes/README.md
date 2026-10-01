# Subtitle fonts

`Montserrat-Bold.ttf` and its license `OFL.txt` (SIL Open Font License 1.1) belong in this folder, from
https://github.com/JulietaUla/Montserrat (`fonts/ttf/Montserrat-Bold.ttf`). They are committed on purpose.

Why: the burned subtitles ask libass for the family `Montserrat` in bold (`lib/dominio/subtitulos.ts`,
`FUENTE_SUBTITULO`). `coni.py` used Avenir Next, which only exists on macOS, and libass resolves a face by name: on a
machine without the folder it settles for whatever variant it finds (a Mac with Adobe Fonts synced picked Montserrat
Black) and says nothing (design Q3). So the render container gets the file through Trigger.dev's `additionalFiles`
build extension (`trigger.config.ts`), `lib/video/ffmpeg.ts` passes this folder as an explicit `fontsdir`, and the
`fontselect` line of `ffmpeg -v verbose` is checked in `tests/integration/ffmpeg.test.ts` and at the start of every `grabar-pieza` run, before anything is spent.

At runtime the folder is `CONI_FONTSDIR` when set, otherwise `assets/fuentes` under the working directory.

Do not rename the file or swap the weight: the style in the ASS asks for Bold, and the check expects the PostScript
name `Montserrat-Bold`.
