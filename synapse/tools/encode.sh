#!/bin/bash
# Kareler + miks → YouTube/TV teslim dosyaları
#   tools/encode.sh            (frames/f_%05d.jpg, out/mix.wav, out/subs.ass gerekir)
# Çıktılar: out/SYNAPSE_B01_Olu_Kod.mp4 (temiz), out/SYNAPSE_B01_Olu_Kod_altyazili.mp4 (altyazı gömülü), .tr.srt
set -e
cd "$(dirname "$0")/.."
FPS=24
VF="scale=1920:1080:flags=lanczos,unsharp=5:5:0.35:5:5:0.0,format=yuv420p"
COMMON=(-c:v libx264 -profile:v high -preset slow -crf 16 -tune animation -pix_fmt yuv420p
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 -movflags +faststart
  -c:a aac -b:a 320k -ar 48000 -ac 2 -shortest)
ffmpeg -y -loglevel error -stats -framerate $FPS -i frames/f_%05d.jpg -i out/mix.wav -vf "$VF" "${COMMON[@]}" \
  -metadata title="SYNAPSE — 1. Bölüm: Ölü Kod" -metadata language=tur out/SYNAPSE_B01_Olu_Kod.mp4
ffmpeg -y -loglevel error -stats -framerate $FPS -i frames/f_%05d.jpg -i out/mix.wav -vf "$VF,subtitles=out/subs.ass:fontsdir=/usr/share/fonts" "${COMMON[@]}" \
  -metadata title="SYNAPSE — 1. Bölüm: Ölü Kod (Türkçe altyazılı)" -metadata language=tur out/SYNAPSE_B01_Olu_Kod_altyazili.mp4
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate,color_primaries -of compact out/SYNAPSE_B01_Olu_Kod.mp4
