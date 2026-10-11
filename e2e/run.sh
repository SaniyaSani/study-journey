#!/usr/bin/env bash
# Runs every automated check. Starts its own servers: one with speech-to-text OFF (8799), one with a canned fake engine (8798).
set -e
cd "$(dirname "$0")/.."
STT_PROVIDER=none PORT=8799 node server.mjs >/tmp/kitten-8799.log 2>&1 & P1=$!
STT_PROVIDER=fake PORT=8798 node server.mjs >/tmp/kitten-8798.log 2>&1 & P2=$!
trap 'kill $P1 $P2 2>/dev/null || true' EXIT
sleep 2
node test-lib.mjs
node test.mjs
node e2e/test_stt_server.mjs
python3 e2e/make_assets.py
for t in e2e/1_main.py e2e/2_features.py e2e/3_files.py; do echo "== $t"; URL=http://localhost:8799/ python3 $t; done
echo "== e2e/4_transcripts.py"; URL2=http://localhost:8798/ python3 e2e/4_transcripts.py
