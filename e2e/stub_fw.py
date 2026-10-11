#!/usr/bin/env python3
"""Stand-in for stt_fw.py so the server -> stt.mjs -> engine hand-over can be tested without a model (see test_stt_server.mjs).
Same command line, checks its arguments like the real one would, writes a result file."""
import argparse, json, sys, os
ap = argparse.ArgumentParser(); ap.add_argument("audio"); ap.add_argument("--out", required=True); ap.add_argument("--lang", default="auto"); ap.add_argument("--glossary", default="")
a = ap.parse_args()
if not os.path.getsize(a.audio): sys.exit("no audio")
import re
if not re.fullmatch(r"auto|[a-z]{2,3}", a.lang) or a.lang == "aut": sys.exit("bad language code: " + a.lang)   # the bug this guards against: "auto" cut to "aut"
print("PROGRESS 0.5", file=sys.stderr)
json.dump(dict(engine="faster-whisper", model="stub", language="de" if a.lang == "auto" else a.lang, language_probability=0.9, forced_language=a.lang, seconds=0,
               segments=[dict(t=1.2, end=3, text="hello " + a.glossary, unclear=False, reasons=[], low=[])]), open(a.out, "w"))
