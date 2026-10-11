#!/usr/bin/env bash
# Reproduces eval/REPORT.md. Downloads two public lecture-style talks (CC-licensed, media.ccc.de) with their human-made subtitles,
# cuts a 4-minute excerpt from each, transcribes it and scores it. Needs: ffmpeg, curl, python3 with faster-whisper + (nothing else).
#   bash eval/run_eval.sh            # large-v3 (slow on CPU: ~1.5x real time)
#   FW_MODEL=small bash eval/run_eval.sh
set -e
cd "$(dirname "$0")/.."; mkdir -p eval/work eval/out; W=eval/work; M=${FW_MODEL:-large-v3}
DE=https://cdn.media.ccc.de/congress/2015/opus/32c3-7525-de-Quantenphysik_und_Kosmologie.opus
DE_SRT=https://cdn.media.ccc.de/congress/2015/32c3-7525-de-en-Quantenphysik_und_Kosmologie.de.srt
EN=https://cdn.media.ccc.de/congress/2018/opus/35c3-9734-eng-Information_Biology_-_Investigating_the_information_flow_in_living_systems_opus.opus
EN_SRT=https://cdn.media.ccc.de/congress/2018/35c3-9734-eng-deu-Information_Biology_-_Investigating_the_information_flow_in_living_systems.en.srt
[ -f $W/de.opus ] || curl -sL -o $W/de.opus $DE;  [ -f $W/de.srt ] || curl -sL -o $W/de.srt $DE_SRT
[ -f $W/en.opus ] || curl -sL -o $W/en.opus $EN;  [ -f $W/en.srt ] || curl -sL -o $W/en.srt $EN_SRT
ffmpeg -loglevel error -y -ss 600 -t 240 -i $W/de.opus -c copy $W/de_ex.opus     # German physics, minutes 10-14
ffmpeg -loglevel error -y -ss 480 -t 240 -i $W/en.opus -c copy $W/en_ex.opus     # English biology + information theory (German speaker), minutes 8-12
python3 stt_fw.py $W/de_ex.opus --lang auto --model $M --out eval/out/de_$M.json
python3 stt_fw.py $W/en_ex.opus --lang auto --model $M --out eval/out/en_$M.json
python3 eval/score.py eval/out/de_$M.json $W/de.srt --start 598 --end 842 --hyp-offset 600 --md eval/out/de_$M.md --json eval/out/de_$M.score.json
python3 eval/score.py eval/out/en_$M.json $W/en.srt --start 478 --end 722 --hyp-offset 480 --md eval/out/en_$M.md --json eval/out/en_$M.score.json
