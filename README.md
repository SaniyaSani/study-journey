# Kitten Mode

A calm, beginner-first lecture companion: record or upload a lecture, get a timestamped transcript, tidy notes, "Kitten Mode" explanations, and a personal course notebook that keeps lectures, materials, questions and tasks connected.

## Run
    node server.mjs            # Node >= 20, no dependencies.  http://localhost:8787  (PORT=... to change)
    ANTHROPIC_API_KEY=...      # optional: AI explanations, "explain this passage", AI rescue card
    pip install -r requirements-stt.txt   # speech-to-text (recommended): faster-whisper, picked automatically. See "Speech to text" below
    # PDF/slide text (optional but recommended): `pdftotext` (poppler-utils) and `unzip` on the server

The app is ES modules, so it must be served over http (the server does this). Opening index.html from disk will not work.

## Test
    npm run test:lib           # pure logic (search, placement, tasks, highlighting, KB)
    npm test                   # LLM stages with a faked model
    pip install playwright reportlab python-pptx && playwright install chromium
    bash e2e/run.sh            # starts its own servers; 58 browser checks (19-step scenario, mobile, migration, failure states, transcript versions) + the STT hand-over test
    bash eval/run_eval.sh      # speech-to-text accuracy on two public lecture talks (slow, downloads ~70 MB, see eval/REPORT.md)
    npm i axe-core && python3 e2e/axe.py                       # WCAG 2.x AA audit (0 violations at time of writing)

## Layout
- `server.mjs` static files + `/api/status|analyze|rescue|explain|extract|transcribe|job`. `stages.mjs` prompts, `llm.mjs` provider, `stt.mjs` transcription.
- `public/js/store.js` persistence (in-memory documents written through to IndexedDB `kitten` v2: stores `a` audio chunks, `kv` documents, `files` blobs; migrates `localStorage['kitten.v2']`, leaves it untouched). `lib.js` pure logic. `core.js` router/events/dialogs. `kb*.js` built-in vocabulary (28 concepts).
- Views: `v-home` (home, course, concept), `v-lecture` (7 tabs, Kitten cards, rescue), `v-notes` (block editor), `v-materials` (Inbox, extraction, viewer), `v-tasks`, `v-search`, `v-capture` (record/upload/processing), `select.js` + `actions.js` (selection actions), `player.js`.

## Data model (all in IndexedDB, one document per key `collection:id`)
semester → course → module(week) → lecture. Lecture: raw `segments[]` (never rewritten; corrections live in `segment.edit`, clean-note edits in `cleanEdits`, additions in `cleanAdds`). Note: ordered `blocks[]` (p, h2, h3, ul, todo, code, callout, quote, img, ref) + revisions. Material: blob in `files`, `extract{state,pages[]}`, `status inbox|filed`, `suggestion`. Task: `kind confirmed|suggested|personal|question`. Everything cites with `ref` objects (`seg`, `audio`, `material+page`, `note`, `concept`, `task`, `lecture`) opened by one function, so links land on the exact source.

## Honest limits
No speaker separation, no OCR (scanned PDFs and images are kept but not searched), `.docx`/`.ppt` text not read, flashcards are stored but have no review mode yet, no sync between devices (export a JSON backup from Privacy & data), search is keyword + concept aliases (not semantic), explanations outside the built-in vocabulary need an API key.

## Deploy
**GitHub:** `git init && git add . && git commit -m "Kitten Mode" && git remote add origin <url> && git push -u origin main`. CI (`.github/workflows/ci.yml`) runs all tests.

**Cloudflare Pages** (front-end + AI endpoints): connect the repo, build command empty, output directory `public`. Add the secret `ANTHROPIC_API_KEY` (Settings → Variables) to switch on AI explanations. `functions/api/[[path]].js` serves `/api/status|analyze|rescue|explain`. Local try-out: `npx wrangler pages dev public` (put the key in `.dev.vars`).
Not available on Cloudflare: PDF/PPTX text reading and speech-to-text (they need `pdftotext`/`unzip`/whisper). Files are still stored and marked "text not read". For those, run `server.mjs` on a small VPS/container instead.
**Protect it:** there is no login. Put Cloudflare Access in front, otherwise anyone who finds the URL can spend your API credits. Your notes live in each visitor's own browser, not on the server.


### Cloudflare Workers (Git-подключение, команда `npx wrangler deploy`)
В репозитории есть `worker.js` + `wrangler.toml`: статика из `public/` и `/api/*` отдаёт один Worker. Build command — пусто, Deploy command — `npx wrangler deploy`. Секрет: Settings → Variables and Secrets → `ANTHROPIC_API_KEY`.


## Speech to text (faithful transcription)

**What is used.** The text of a lecture comes from the *recording*, not from the browser's live captions.

| Engine | Where | When |
|---|---|---|
| `faster` (default when installed) | this computer, `stt_fw.py`, Whisper **large-v3** | `pip install -r requirements-stt.txt` and `ffmpeg`. First run downloads the model (~3 GB). Audio never leaves the machine. |
| `local` | whisper.cpp | `WHISPER_MODEL=/path/ggml-*.bin` |
| `openai` | OpenAI API (audio is sent there) | only if you choose it: `STT_PROVIDER=openai OPENAI_API_KEY=...` |
| browser Web Speech API | Chrome/Safari, live | only a **rough live preview** while recording. Marked as a draft everywhere. It is never treated as the transcript when a real engine is available. |

Tuning: `FW_MODEL=large-v3-turbo` (considerably faster, usually slightly less accurate; not measured here), `FW_MODEL=small` for old laptops, `FW_DEVICE=cuda` with a GPU, `FW_COMPUTE=int8|float16`. `STT_PROVIDER=none` switches transcription off.

**Rules the transcription follows.**
- The original language is kept (task = transcribe, never translate). Choose the spoken language per lecture; "detect automatically" works but a chosen language is more reliable.
- Nothing is invented or "repaired". Passages the model was unsure about are marked *unclear* (dotted line, reason shown) and individual doubtful words are underlined. The text itself is unchanged.
- The decoder never sees the previous sentence (`condition_on_previous_text=False`) and silence is cut by voice-activity detection, which is what stops invented text and endless repetition.
- Course names and concept lists are **not** fed to the recogniser (that makes it hear words nobody said). You can give optional spelling hints per transcription; they are off by default.
- AI explanations are a separate step. Lines marked unclear are tagged `[UNCLEAR]` for the AI, which is told not to repair or build on them.

**Original audio and transcribing again.** The recording stays in the browser (IndexedDB) and is never altered. *Manage -> Transcribe the recording again* runs the engine again (other language, better model). The old transcript, with your corrections, is kept under *Transcript versions*; notes and tasks that cited a line of the old version become exact "moment in the recording" links.

**Recording settings.** Mono, 96 kbps Opus, echo cancellation and noise suppression off (they are made for phone calls and can gate quiet speech in a hall), automatic gain on.

**Limits.** Swiss-German dialect is not Standard German: Whisper will produce a best-effort Standard-German text with more errors. Overlapping speakers, very quiet rows at the back and loud room noise lower accuracy; the model can also be *confidently* wrong on a rare word, and confidence marking cannot catch that. Rare names and formulae should be checked against the audio (tap the time stamp). See `eval/REPORT.md` for measured numbers and how they were obtained.
