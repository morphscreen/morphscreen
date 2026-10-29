#!/usr/bin/env bash
# Screenshots every page in compare/out/<label> with headless Chrome, trims the
# empty space below the content and puts each brief's two renderings side by
# side: compare/out/<label>/shots/<brief>-<theme>.png (ours left, OpenUI right).
#   bash compare/shoot.sh nemotron-visual [brief-prefix]
set -euo pipefail
label=${1:-nemotron-visual}
only=${2:-}
out="$(cd "$(dirname "$0")" && pwd)/out/$label"
chrome=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
mkdir -p "$out/shots/raw"
for page in "$out"/${only}*-{ours,openui}-{light,dark}.html; do
  [ -e "$page" ] || continue
  name=$(basename "$page" .html)
  "$chrome" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --virtual-time-budget=6000 --window-size=860,9000 \
    --screenshot="$out/shots/raw/$name.png" "file://$page" >/dev/null 2>&1
  magick "$out/shots/raw/$name.png" -define trim:edges=south -trim +repage "$out/shots/raw/$name.png"
done
for ours in "$out"/shots/raw/${only}*-ours-*.png; do
  name=$(basename "$ours" .png)
  brief=${name%-ours-*}
  theme=${name##*-ours-}
  magick "$ours" "$out/shots/raw/$brief-openui-$theme.png" -background "#888" -gravity north +append \
    "$out/shots/$brief-$theme.png"
done
