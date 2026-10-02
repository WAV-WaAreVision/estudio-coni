#!/bin/sh
# Regenerates reel-subtitulado.mp4: `sh tests/fixtures/ingesta/generar-reel.sh` (needs ffmpeg-full, for drawtext).
# 6 s, 360x640: three different subtitle lines (0-2 s, 2-4 s, 5-6 s), no text from 4 to 5 s, silent audio.
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
FFMPEG="${CONI_FFMPEG:-/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg}"
FUENTE="$AQUI/../../../assets/fuentes/Montserrat-Bold.ttf"
LINEA="fontfile=$FUENTE:fontsize=30:fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h*0.75"
"$FFMPEG" -hide_banner -v error -y \
  -f lavfi -i "color=c=0x203040:s=360x640:r=10:d=6" \
  -f lavfi -i "anullsrc=r=16000:cl=mono" \
  -vf "drawtext=$LINEA:text='Hola soy Coni':enable='between(t,0,2)',drawtext=$LINEA:text='Hablemos de limites':enable='between(t,2,4)',drawtext=$LINEA:text='Gracias por ver':enable='between(t,5,6)'" \
  -c:v libx264 -preset veryslow -crf 32 -pix_fmt yuv420p -c:a aac -b:a 16k -shortest -t 6 \
  "$AQUI/reel-subtitulado.mp4"
