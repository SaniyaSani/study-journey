#!/usr/bin/env python3
"""Faithful speech-to-text sidecar for Kitten Mode (faster-whisper, runs fully on this machine).

    python3 stt_fw.py AUDIO --out out.json [--lang auto|de|en|...] [--model large-v3]
                      [--glossary "term, term"] [--start S] [--end S] [--no-vad]

Design rules (these are about fidelity, not prettiness):
  * task is always "transcribe": the original language is kept, nothing is translated.
  * condition_on_previous_text=False: one bad passage cannot snowball into invented text.
  * No LLM touches the output. Uncertain passages are MARKED (unclear / low-probability words),
    never rewritten.  The glossary is only a spelling hint for Whisper's decoder; it is off by default.
  * Output is JSON: segments with absolute times, per-word probability, and honest flags.
Progress goes to stderr as lines "PROGRESS 0.37".
"""
import argparse, json, sys, time, os

# Words the model gave less than this probability are underlined in the UI. Measured on real lecture excerpts (eval/REPORT.md):
# 0.45 flagged about 1% of words and caught 1 of 25 differing words in English; 0.7 flags 2-6% and catches 6 of 25 (English) and 4 of 52 (German).
# It is a hint to check the audio, not a guarantee: a model can be confidently wrong on a rare term.
LOWP = float(os.environ.get("FW_LOWP", "0.7"))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio"); ap.add_argument("--out", required=True)
    ap.add_argument("--lang", default="auto"); ap.add_argument("--model", default=os.environ.get("FW_MODEL", "large-v3"))
    ap.add_argument("--glossary", default=""); ap.add_argument("--start", type=float, default=0); ap.add_argument("--end", type=float, default=0)
    ap.add_argument("--no-vad", action="store_true"); ap.add_argument("--compute", default=os.environ.get("FW_COMPUTE", "int8"))
    ap.add_argument("--beam", type=int, default=5)
    a = ap.parse_args()

    from faster_whisper import WhisperModel
    import subprocess
    import numpy as np
    t0 = time.time()
    model = WhisperModel(a.model, device=os.environ.get("FW_DEVICE", "auto"), compute_type=a.compute, cpu_threads=int(os.environ.get("FW_THREADS", "0")))
    sr = 16000
    # Decode the ORIGINAL file with ffmpeg (any container the browser produces: webm/opus, mp4/aac, wav, ...). No lossy intermediate.
    raw = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", a.audio, "-f", "f32le", "-ac", "1", "-ar", str(sr), "-"], capture_output=True, check=True).stdout
    audio = np.frombuffer(raw, dtype=np.float32)
    total = len(audio) / sr
    s0 = int(a.start * sr); e0 = int(a.end * sr) if a.end else len(audio)
    audio = audio[s0:e0]; offset = a.start

    lang = None if a.lang in ("", "auto") else a.lang
    kw = dict(language=lang, task="transcribe", beam_size=a.beam, temperature=[0.0, 0.2, 0.4],
              condition_on_previous_text=False, word_timestamps=True,
              compression_ratio_threshold=2.4, log_prob_threshold=-1.0, no_speech_threshold=0.6,
              hallucination_silence_threshold=2.0, vad_filter=not a.no_vad,
              vad_parameters=dict(min_silence_duration_ms=600, speech_pad_ms=250))
    if a.glossary.strip():
        kw["initial_prompt"] = a.glossary.strip()[:600]
    segs, info = model.transcribe(audio, **kw)
    dur = len(audio) / sr
    out = []
    for s in segs:
        words = [dict(w=w.word, s=round(w.start + offset, 2), e=round(w.end + offset, 2), p=round(w.probability, 3)) for w in (s.words or [])]
        lowp = [w for w in words if w["p"] < LOWP and len(w["w"].strip(" .,;:!?")) > 1]
        reasons = []
        if s.avg_logprob < -1.0: reasons.append("low-confidence")
        if s.no_speech_prob > 0.6: reasons.append("maybe-no-speech")
        if s.compression_ratio > 2.4: reasons.append("repetitive")
        if len(lowp) >= 3 and len(lowp) / len(words) > 0.3: reasons.append("many-uncertain-words")
        # character ranges (in the stripped segment text) of words the model was unsure about: the UI underlines them, the text is NOT changed
        low, pos, joined = [], 0, "".join(w.word for w in (s.words or []))
        lead = len(joined) - len(joined.lstrip())
        if joined.strip() == s.text.strip():
            for w in (s.words or []):
                st = pos - lead; pos += len(w.word)
                core = w.word.strip().strip(".,;:!?\"'()[]")            # underline the word, not the comma after it
                if w.probability < LOWP and len(core) >= 3:
                    a2 = st + w.word.index(core) if core in w.word else st
                    low.append([max(0, a2), max(0, a2) + len(core)])
        out.append(dict(t=round(s.start + offset, 2), end=round(s.end + offset, 2), text=s.text.strip(),
                        logprob=round(s.avg_logprob, 3), no_speech=round(s.no_speech_prob, 3), comp=round(s.compression_ratio, 2),
                        unclear=bool(reasons), reasons=reasons, low=low, words=words))
        print("PROGRESS %.3f" % min(1, (s.end) / max(dur, 1)), file=sys.stderr, flush=True)
    res = dict(engine="faster-whisper", model=a.model, compute=a.compute, language=info.language, language_probability=round(info.language_probability, 3),
               forced_language=lang, duration=round(total, 2), range=[a.start, a.end or round(total, 2)], vad=not a.no_vad,
               glossary=bool(a.glossary.strip()), seconds=round(time.time() - t0, 1), segments=out)
    with open(a.out, "w", encoding="utf8") as f: json.dump(res, f, ensure_ascii=False)
    print("DONE", res["seconds"], "s", file=sys.stderr)

if __name__ == "__main__":
    main()
