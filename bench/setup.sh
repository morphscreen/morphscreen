#!/bin/sh
# Fetches thesysdev/generative-ui-bench at the commit our comparison uses, into
# bench/.vendor (git-ignored: it has no license, so it's used locally, never
# copied into this repo). It supplies the 46 briefs and OpenUI's own prompt and
# validator (@openuidev/lang-core 0.2.16).
set -eu
COMMIT=fcca05af68dc3acc5b04660531509b4aed861c7e
DIR=$(cd "$(dirname "$0")" && pwd)/.vendor
if [ ! -d "$DIR/.git" ]; then
  git clone -q https://github.com/thesysdev/generative-ui-bench.git "$DIR"
fi
git -C "$DIR" fetch -q origin "$COMMIT" 2>/dev/null || true
git -C "$DIR" checkout -q "$COMMIT"
(cd "$DIR" && npm ci --no-audit --no-fund --loglevel=error)
echo "generative-ui-bench ready at $DIR ($COMMIT)"
