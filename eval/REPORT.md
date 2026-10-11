# Speech-to-text evaluation

Date of the measurements: 9 Oct 2026. Everything below was measured in this repository's own pipeline (`stt_fw.py`, `eval/score.py`); the exact steps are in `eval/run_eval.sh`, and `eval/out/` holds the transcripts, side-by-side tables and scores of that script's run. (The small-model, prompt and degraded-audio runs in section 3 were run by hand with the same scripts and options and are not in `eval/out/`.)

## 1. What the app used before

| Path | Engine | Problem found in the code |
|---|---|---|
| Live recording | the browser's Web Speech API (`SpeechRecognition`) | `lang` was **hard-coded to `en-US`**: a German lecture is decoded as if it were English. The live text *was* the transcript, with nothing better replacing it. Chrome sends the audio to Google; Safari/Firefox may not offer it at all. Word confidence was only used for a single "low" flag. |
| Uploaded file | `whisper.cpp` or OpenAI, **only if configured** | Without configuration there was no transcription at all. The recogniser was prompted with the course name and the list of concept names, which can make a recogniser hear words that were not said. Language was always auto-detect, no way to choose. |
| Microphone | `getUserMedia({audio:true})` | Browser defaults: echo cancellation and noise suppression on (made for phone calls; in a hall they can gate quiet speech), unspecified bitrate. |
| Re-transcribing | not possible | Replacing a transcript deleted the old one and its corrections. |

**Not measured:** the browser's Web Speech engine. It streams audio to a remote service and cannot be run headless in this environment, so there is no number for it here. The comparison on *your* lectures is built into the app instead: when a live draft is replaced by the faithful transcript, the draft is kept under *Transcript versions* and can be read side by side with the new one.

## 2. Test material (public, not your professor)

I do not have your recordings (they are in your browser). I used two real lecture-style talks with **human-made subtitles** (media.ccc.de, CC-licensed), 4 minutes each:

| | Talk | Language / speaker | Content |
|---|---|---|---|
| DE | "Quantenphysik und Kosmologie" (32C3), minutes 10-14 | German, one speaker, live audience | physics: Quanten, Photoeffekt, Heisenberg, Schrödinger, Matrizen-/Wellenmechanik |
| EN | "Information Biology" (35C3), minutes 8-12 | English with a German accent | biology + information theory: calcium signalling, NFAT, band-pass, hourglass/bow-tie |

Limits of this test: studio-quality mix, one speaker per excerpt, no Swiss-German dialect, not a lecture hall microphone. The subtitles are an edited record (they contain typos such as *releativitätstheorie*, *komsiches*, *Plank/Plant* for Planck, and leave out most fillers), so a raw WER against them overstates the errors of a correct transcript. I report both a **strict** WER and a **spelling-tolerant** WER (same word with different spelling, das/dass, compound written together or apart, are not counted), and list every remaining difference. Words that hang over the cut ends of an excerpt are excluded. Differences were classified by reading them next to the subtitles, **not by listening**.

## 3. Results

| Test | Engine | Strict WER | Spelling-tolerant WER | Language | Notes |
|---|---|---|---|---|---|
| DE physics | faster-whisper **large-v3** | 11.6 % | **7.3 %** | de (99.8 %) | 52 segments, text identical on a second run |
| DE physics | faster-whisper small | 11.7 % | 7.4 % | de | on clean studio audio the small model is about as good |
| DE physics, degraded* | large-v3, language chosen | 13.3 % | 8.7 % | de | a few more real errors |
| EN biology | large-v3 | 5.7 % | **4.3 %** | en (99 %) | |

\*Degraded = the same excerpt with synthetic hall reverb + pink noise, re-encoded as 16 kHz mono Opus 24 kbit/s. It is a simulation, not a real hall.

**Missing sentences.** None. The longest run of subtitle words missing from the transcript (excluding the cut ends) is 4 words ("da wird es jetzt"). What is dropped are short disfluencies: repeated "auch, auch, auch!" became one "auch" (the professor's emphasis by repetition is lost), "eben", "jetzt", a few filler-like words. Whisper is *faithful in content* but not fully *verbatim*.

**Language kept.** German stayed German, English stayed English (task = transcribe, never translate). Per-lecture language can be chosen.

**Scientific terms.** DE: all 11 listed terms present and correctly spelled (Quantenmechanik, Quantenphysik, Photoelektrischen Effekt, Unschärfe-Relation, Schrödinger, Heisenberg, Matrizenmechanik, Wellenmechanik, Wellengleichung, Nobelpreis, Frequenz); *Planck* is written correctly where the subtitles have *Plank/Plant*. EN: "nuclear factor of activated T cells", "information theory", "hourglass", "frequency modulation", "band-pass activation" correct. **Errors are concentrated in rare names and acronyms:** the speaker's name *Arne Schoch* became "on a shock", the transcription factor *NFAT* became "and fat". Also "bow tie" -> "bowtie" and "signalling" -> "signaling" (spelling only).

**Remaining differences** (after removing spelling): DE large-v3: 8 substituted words of 587. Four of them are not recognition errors (number formatting "3 Viertel" / "1", and the subtitles' own *Plant* for Planck, twice). The rest: "ja" for "da", a swapped word order ("wurde plötzlich Einstein" vs "wurde Einstein plötzlich"), and the collapsed "auch auch auch". EN: 5 of 559 (this/these, a/the, they're/are, "0" for "point", and the name above).

**Does the "unclear" marking catch errors?** Only partly, and this matters for how much to trust it. Word probabilities were checked against the words that differ from the subtitles:

| Threshold | EN: words flagged | EN: differing words caught | DE: words flagged | DE: differing words caught |
|---|---|---|---|---|
| p < 0.45 (old value) | 1.6 % | 1 of 25 | 0.5 % | 2 of 52 |
| **p < 0.70 (now)** | 5.8 % | 6 of 25 | 2.3 % | 4 of 52 |
| p < 0.90 | 12.9 % | 12 of 25 | 6.3 % | 5 of 52 |

(many of the "differing" words are harmless spelling variants, so this understates the catch rate on real errors, but "a model can be confidently wrong on a rare term" is real: *NFAT -> fat* had p = 0.56, *Schoch -> shock* p = 0.67.) No whole segment was marked *unclear* on these clean recordings, as it should be. The marking is a hint to check the audio, never a guarantee; the time stamp next to every line plays the original.

**Prompt experiment.** The old code fed course name and concept names to the recogniser. With `small` on the German excerpt and the prompt "ESC401 High Performance Computing. Terms: MPI, Slurm, OpenMP, ..." none of those terms appeared in the output, but the prompt changed 6 places and introduced 3 new errors ("Einstein" -> "ein, Stein" / "Einsteinen", "Unschärfe" -> "unscherfe"). So it is now off; spelling hints are optional and per transcription.

**Audio quality.** Moving from the studio mix to a reverberant, noisy, low-bitrate version cost about 1.4 points of WER and added a few real errors (e.g. "doof" -> "groß"). The engine is far more sensitive to the *language setting* than to this level of audio degradation. Echo cancellation/noise suppression are switched off and 96 kbit/s mono is requested for recording; that choice follows from how those filters work, it was **not** A/B-tested in a real lecture hall.

**Speed** (2 CPU cores, int8, large-v3): about 1.2-1.4x real time. A 90-minute lecture takes roughly 2 hours on a weak laptop CPU, minutes on a GPU. `FW_MODEL=small` is about 4x faster here and was equally good on clean audio; `large-v3` is the safer default for accents and noise.

## 4. Verdict

- The old live path (browser engine, fixed English) cannot be adequate for German lectures, and the file path was off by default. Both are replaced by faithful transcription from the stored recording with Whisper large-v3.
- On two real talks the new transcript has no missing sentences, keeps the language, and gets scientific terms right, with ~4-7 % word differences that are mostly spelling and dropped repetitions.
- Not solved: rare names/acronyms, Swiss-German dialect, fully verbatim fillers, and detecting every error automatically. Check names and numbers against the audio.
- Still to do by you: run it on your professor's recording (upload it, or record). If it is poor there, try `FW_MODEL=large-v3` with the language chosen, a better microphone position, and tell me what it gets wrong.
