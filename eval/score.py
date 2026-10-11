#!/usr/bin/env python3
"""Compare a transcript JSON (from stt_fw.py) with a human subtitle file for the same excerpt.

    python3 eval/score.py hyp.json ref.srt --start 600 --end 840 [--terms "Quantenmechanik,Impuls"] [--md report.md]

Reports: WER and its parts (substitutions / deletions = missed words / insertions), the longest runs of reference
words that are missing from the transcript, and a check of the scientific terms you list.
Caveat that matters when reading the numbers: subtitles are an edited record. They usually drop fillers ("äh", "also")
and repair false starts, so insertions against subtitles are often correct verbatim speech. Deletions and substitutions are the
numbers to look at, and the side-by-side in --md lets a human check them.
"""
import argparse, json, re, sys, unicodedata, difflib

def srt_cues(path):
    txt = open(path, encoding="utf8").read().replace("\r", "")
    cues = []
    for blk in re.split(r"\n\n+", txt.strip()):
        m = re.search(r"(\d+):(\d+):(\d+)[,.](\d+) --> (\d+):(\d+):(\d+)[,.](\d+)\n(.*)", blk, re.S)
        if not m: continue
        g = list(map(int, m.groups()[:8]))
        s = g[0]*3600+g[1]*60+g[2]+g[3]/1000; e = g[4]*3600+g[5]*60+g[6]+g[7]/1000
        cues.append((s, e, " ".join(m.group(9).split("\n"))))
    return cues

NUM = {w: str(i) for i, w in enumerate("null eins zwei drei vier fünf sechs sieben acht neun zehn elf zwölf dreizehn vierzehn fünfzehn sechzehn siebzehn achtzehn neunzehn zwanzig".split())}
NUM.update({w: str(i) for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split())})
NUM.update({"hundert": "100", "tausend": "1000", "hundred": "100", "thousand": "1000"})
FILL = {"äh", "ähm", "öh", "uh", "um", "uhm", "hm", "hmm", "mhm", "eh"}   # subtitles leave these out; they are real speech, not errors

def norm(t):
    t = re.sub(r"\[[^\]]*\]|\*[^*]*\*", " ", t)                          # [Music], *35C3 preroll music*
    t = re.sub(r"^\s*[A-Za-zÄÖÜäöü ]{2,20}:\s", " ", t)                   # "Engel: " speaker labels
    t = unicodedata.normalize("NFKC", t).lower().replace("ß", "ss")
    t = re.sub(r"(?<=\d)[.,](?=\d{3}\b)", "", t)                          # 1,000 -> 1000
    t = re.sub(r"[^\w\s']", " ", t.replace("-", " "))                      # hyphens and punctuation -> space
    return " ".join(NUM.get(w, w) for w in t.split() if w not in FILL)


def align(R, H):
    """Plain word alignment (edit distance), then the ends are trimmed back to the first/last run of 3 identical words.
    The subtitle clock is not aligned with the audio (cues appear late), so the first/last words of an excerpt can belong to the
    neighbouring sentence. Those overhanging words are reported separately and are not counted as errors."""
    n, m = len(R), len(H)
    C = [[0] * (m + 1) for _ in range(n + 1)]; B = [[None] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1): C[i][0] = i; B[i][0] = "D"
    for j in range(1, m + 1): C[0][j] = j; B[0][j] = "I"
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            sub = C[i-1][j-1] + (0 if R[i-1] == H[j-1] else 1); dele = C[i-1][j] + 1; ins = C[i][j-1] + 1
            C[i][j] = min(sub, dele, ins)
            B[i][j] = ("E" if R[i-1] == H[j-1] else "S") if sub == C[i][j] else "D" if dele == C[i][j] else "I"
    i, j, ops = n, m, []
    while i > 0 or j > 0:
        k = B[i][j]
        if k in ("E", "S"): ops.append((k, R[i-1], H[j-1])); i -= 1; j -= 1
        elif k == "D": ops.append(("D", R[i-1], "")); i -= 1
        else: ops.append(("I", "", H[j-1])); j -= 1
    ops.reverse()
    anchors = [k for k in range(len(ops) - 2) if all(ops[k + d][0] == "E" for d in range(3))]
    if not anchors: return ops, 0, 0
    lo, hi = anchors[0], anchors[-1] + 3
    ed = sum(1 for o in ops[:lo] + ops[hi:] if o[0] in "DS"); ei = sum(1 for o in ops[:lo] + ops[hi:] if o[0] in "IS")
    return ops[lo:hi], ed, ei

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("hyp"); ap.add_argument("ref")
    ap.add_argument("--start", type=float, default=0); ap.add_argument("--end", type=float, default=1e9)
    ap.add_argument("--hyp-offset", type=float, default=0, help="seconds to add to the transcript times (use the excerpt start when you transcribed a cut-out)")
    ap.add_argument("--terms", default=""); ap.add_argument("--md", default=""); ap.add_argument("--json", default="")
    a = ap.parse_args()
    h = json.load(open(a.hyp))
    for s_ in h["segments"]: s_["t"] += a.hyp_offset; s_["end"] = s_.get("end", s_["t"]) + a.hyp_offset
    cues = [c for c in srt_cues(a.ref) if c[0] >= a.start - 0.5 and c[1] <= a.end + 0.5]
    ref_txt = norm(" ".join(c[2] for c in cues))
    hyp_txt = norm(" ".join(s["text"] for s in h["segments"] if s["t"] >= a.start - 1 and s["t"] <= a.end))
    R, H = ref_txt.split(), hyp_txt.split()
    ops, edge_del, edge_ins = align(R, H)
    S = sum(1 for o in ops if o[0] == "S"); Dl = sum(1 for o in ops if o[0] == "D"); I = sum(1 for o in ops if o[0] == "I")
    n = sum(1 for o in ops if o[0] in "ESD")
    def runs(kind):
        out, cur = [], []
        for o in ops + [("E", "", "")]:
            if o[0] == kind: cur.append(o)
            elif cur: out.append(cur); cur = []
        return out
    miss = sorted([" ".join(x[1] for x in r) for r in runs("D")], key=lambda x: -len(x.split()))
    # spelling-tolerant view: substitutions that are the same word with a different spelling (typos in the subtitles, das/dass, ß/ss,
    # compound written together or apart, signalling/signaling) are not recognition errors.
    sim = lambda x, y: difflib.SequenceMatcher(None, x, y).ratio() >= 0.8 or x.replace(" ", "") in y.replace(" ", "") or y.replace(" ", "") in x.replace(" ", "")
    S_real = [(x[1], x[2]) for x in ops if x[0] == "S" and not sim(x[1], x[2])]
    res = dict(engine=h.get("engine"), model=h.get("model"), language=h.get("language"), ref_words=n, wer=round((S + Dl + I) / max(n, 1), 4),
               wer_spelling_tolerant=round((len(S_real) + Dl + I) / max(n, 1), 4), real_substitutions=S_real,
               substitutions=S, deletions=Dl, insertions=I, edge_words_ignored=dict(deleted=edge_del, inserted=edge_ins),
               substitution_pairs=[(x[1], x[2]) for x in ops if x[0] == "S"],
               inserted_runs=[" ".join(x[2] for x in r) for r in runs("I")],
               deleted_runs=[" ".join(x[1] for x in r) for r in runs("D")],
               longest_missing_runs=[m for m in miss if len(m.split()) >= 3][:8],
               unclear_segments=sum(1 for s in h["segments"] if s.get("unclear")), segments=len(h["segments"]))
    terms = [t.strip() for t in a.terms.split(",") if t.strip()]
    if terms:
        res["terms"] = {t: dict(in_reference=norm(t) in ref_txt, in_transcript=norm(t) in hyp_txt) for t in terms}
    print(json.dumps(res, ensure_ascii=False, indent=1))
    if a.json: json.dump(res, open(a.json, "w"), ensure_ascii=False, indent=1)
    if a.md:
        with open(a.md, "w", encoding="utf8") as f:
            f.write("| time | human subtitles | transcript (as heard) | flags |\n|---|---|---|---|\n")
            for s in h["segments"]:
                if not (a.start - 1 <= s["t"] <= a.end): continue
                rr = " ".join(c[2] for c in cues if c[0] < s.get("end", s["t"]+5) and c[1] > s["t"])
                f.write("| %d:%02d | %s | %s | %s |\n" % (s["t"]//60, s["t"] % 60, rr.replace("|", "/"), s["text"].replace("|", "/"), ", ".join(s.get("reasons", []))))
if __name__ == "__main__": main()
