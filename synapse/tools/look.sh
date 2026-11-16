#!/bin/bash
# Hızlı inceleme karesi: tools/look.sh <çıktı.jpg> "<sorgu>" [w] [h] [t]
#   ör: tools/look.sh /tmp/a.jpg "mode=char&name=atlas&view=face&expr=happy"
#   SYN_DIST ortam değişkeni: derleme klasörü (varsayılan: dist). Önce: node tools/build.mjs [--out klasör]
OUT=$1; Q=$2; W=${3:-960}; H=${4:-540}; T=${5:-0}
D=$(mktemp -d)
node "$(dirname "$0")/frames.mjs" --w $W --h $H --q "$Q" --out $D --times $T 2>&1 | grep -v "^t=" 
mv $D/t_*.jpg "$OUT" 2>/dev/null && rmdir $D
