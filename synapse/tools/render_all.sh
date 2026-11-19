#!/bin/bash
# Tüm bölümü kare kare render eder (devam ettirilebilir). Çıktı: frames/f_XXXXX.jpg
#   tools/render_all.sh [W] [H] [FROM] [TO]
cd "$(dirname "$0")/.."
W=${1:-1600}; H=${2:-900}; FROM=${3:-0}; TO=${4:-999999}
mkdir -p frames out
node tools/frames.mjs --w $W --h $H --from $FROM --to $TO --out frames --resume --fmt jpg --q 0.96
