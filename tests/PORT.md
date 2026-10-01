# Port of `coni-heygen/scripts/coni.py`

Design decision D7 (2026-09-30): port the behaviour cases and pin the output of two real reels.

## Ported in Plan 1

| Python (`coni-heygen/tests/test_coni.py`) | TypeScript |
|---|---|
| `TestEstimaciones` (4) | `tests/unit/estimaciones.test.ts` (+ Python rounding and word-split parity) |
| `TestErrorHeygen` (3) | `tests/unit/errores.test.ts` (+ v3 body, never empty, 400-char cap) |
| `TestPedido` (17) | `tests/unit/pedido.test.ts` (+ parity fixes) and `tests/unit/pedido-reales.test.ts` (2 real requests) |
| `TestSubtitulosTexto` (5) | `tests/unit/subtitulos.test.ts` (+ edges pinned from coni.py) |
| (difflib) | `tests/unit/secuencias.test.ts`, `tests/unit/secuencias-fixture.test.ts` (200 Python cases) |
| (2 real reels) | `tests/unit/subtitulos-goldens.test.ts` |

## Intentional differences from coni.py

- Subtitle font Montserrat instead of Avenir Next (render runs in a Linux container).
- ASS text escapes `{`, `}` and `\` so libass draws the script literally.
- Unreadable SRT timestamps raise a `Falla` ("ilegible") instead of a `ValueError`; a trailing-dot timestamp is rejected.
- Empty script or empty SRT raise their own `Falla` before alignment.
- Messages are written for Coni ("Los subtítulos de HeyGen no calzan con el guion...") or tagged `FallaDeConfiguracion` when they are for WAV.
- HeyGen errors are read from the HTTP body, trimmed, never empty and capped at 400 characters.
- The request builder returns `ruta` and `avisos` instead of printing; `engine_type` in the ElevenLabs settings cannot be overridden.

## Deferred to the plan that owns the I/O

| Python | Goes with | Why |
|---|---|---|
| `TestEsperar` (4) | Plan 3, T7 `grabar-pieza` | Polling becomes a Trigger.dev waitpoint plus reconciliation |
| `TestSubtitulos` (6) | Plan 3, T7 `grabar-pieza` | ffmpeg, fetching the SRT and the size limit run in the container |
| `TestVerificarElevenLabs` (1) and `error_elevenlabs` | Plan 3, T6 `producir-pieza` | ElevenLabs over HTTP with MSW |

## Not ported (terminal commands)

`TestLeerEnv`, `TestVerificar`, `TestVerificarReferencia`, `TestVerificarFfmpeg`, `TestVoz`, `TestMain`.
