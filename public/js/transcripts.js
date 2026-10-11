// Transcript versions: the UI (language list, provenance bar, "transcribe again", versions sheet). Logic lives in transcripts-core.js.
import { lec, save } from './store.js';
import { esc } from './lib.js';
import { H, sheet, closeSheet, ask, confirmSheet, toast, render, nav } from './core.js';
import { versionsOf, kindLabel, archiveTranscript, freezeSegRefs, applyTranscript, restoreVersion } from './transcripts-core.js';
export { versionsOf, kindLabel, archiveTranscript, freezeSegRefs, applyTranscript, restoreVersion };

export const LANGS = [{ v: 'auto', l: 'Detect automatically' }, { v: 'de', l: 'German' }, { v: 'en', l: 'English' }, { v: 'fr', l: 'French' }, { v: 'it', l: 'Italian' }, { v: 'uk', l: 'Ukrainian' }, { v: 'ru', l: 'Russian' }];
export const LANG_NAME = Object.fromEntries(LANGS.map(x => [x.v, x.l]).concat([['es', 'Spanish']]));
// browser live-draft language tags (Web Speech API needs a concrete locale)
export const SR_LOCALE = { de: 'de-CH', en: 'en-GB', fr: 'fr-CH', it: 'it-CH', uk: 'uk-UA', ru: 'ru-RU', es: 'es-ES' };

export const unclearCount = L => L.segments.filter(s => s.unclear).length;

/** Small honest header for the transcript tab: who wrote this text, in which language, how much is unsure. */
export function provenanceBar(L) {
  if (!L.segments.length || L.fixture) return '';
  const u = unclearCount(L), vs = versionsOf(L).length;
  const who = L.transcriptSource === 'live' ? '🎤 <b>Live draft</b> from your browser’s speech service. It is a rough preview, not a faithful transcript.'
    : L.transcriptSource === 'pasted' ? '✍️ <b>Pasted transcript.</b>'
      : L.stt ? `🎧 <b>Transcribed from the recording</b> by ${esc(kindLabel(L))} on ${L.stt.engine === 'openai' ? 'OpenAI’s servers' : 'this computer'}. Language: ${esc(LANG_NAME[L.stt.language] || L.stt.language || '?')}${L.stt.languageProbability ? ` (${L.stt.forcedLanguage ? 'you chose it' : 'detected, ' + Math.round(L.stt.languageProbability * 100) + '%'})` : ''}.`
        : '';
  if (!who) return '';
  return `<div class="paper small">${who} ${u ? `<b>${u}</b> passage${u === 1 ? ' is' : 's are'} marked <i>unclear</i>: I did not guess what was said there.` : 'Nothing is marked unclear.'} ${L.hasAudio && nav.api.stt ? `<button class="mini-act" data-act="retranscribe" data-id="${L.id}">🔁 Transcribe again</button>` : ''}${vs ? ` <button class="mini-act" data-act="tversions" data-id="${L.id}">🗂 ${vs} earlier version${vs === 1 ? '' : 's'}</button>` : ''}</div>`;
}

/* ---------- UI ---------- */
H.retranscribe = async d => {
  closeSheet(); const L = lec(d.id); if (!L) return;
  if (!L.hasAudio) return toast('There is no recording attached to this lecture, so there is nothing to transcribe again.');
  if (!nav.api.stt) return toast('No transcription service is connected.');
  const info = nav.api.sttInfo || {};
  const v = await ask({
    title: 'Transcribe this recording again',
    intro: `Uses the original recording, which is never changed. Engine: <b>${esc(info.provider || '')} ${esc(info.model || '')}</b>${info.provider === 'openai' ? '. <b>The audio is sent to OpenAI.</b>' : ', on this computer.'} The current transcript is kept as an earlier version.`,
    fields: [
      { id: 'lang', label: 'Spoken language', type: 'select', value: L.lang && LANG_NAME[L.lang] ? L.lang : 'auto', options: LANGS },
      { id: 'glossary', label: 'Spelling hints (optional)', type: 'textarea', rows: 2, value: '', placeholder: 'Names and terms as they are spelled, separated by commas. Leave empty if unsure: hints can make the model hear words that were not said.' }
    ], ok: 'Transcribe again'
  });
  if (!v) return;
  const { transcribeLecture } = await import('./v-capture.js');
  const { go } = await import('./core.js');
  L.status = 'processing'; save('lectures', L);
  L.pendingTx = { lang: v.lang, glossary: (v.glossary || '').trim() }; save('lectures', L);
  go('proc', { id: L.id });
};

H.tversions = d => {
  const L = lec(d.id); if (!L) return;
  const rows = versionsOf(L).slice().reverse().map(v => `<div class="paper small"><b>${esc(v.label)}</b> · ${v.segments.length} lines · ${v.segments.filter(s => s.unclear).length} unclear<br><span class="muted">made ${new Date(v.created).toLocaleString()}${v.why ? ' · ' + esc(v.why) : ''}${Object.keys(v.cleanEdits || {}).length ? ' · has your corrections' : ''}</span><br>
  <span class="muted">${esc(v.segments.slice(0, 2).map(s => s.text).join(' ').slice(0, 140))}…</span><br><button class="btn soft" data-act="restoreVersion" data-id="${L.id}" data-v="${v.id}">Make this the current transcript</button></div>`).join('');
  sheet(`<h3>Transcript versions</h3><p class="small muted">Current: <b>${esc(kindLabel(L))}</b>, ${L.segments.length} lines. Earlier versions are kept untouched. The recording itself is never changed.</p>${rows || '<p class="muted">No earlier versions.</p>'}<div class="row"><button class="btn ghost" data-act="closeSheet">Close</button></div>`, { label: 'Transcript versions' });
};
H.restoreVersion = async d => {
  const L = lec(d.id); if (!L) return;
  if (!await confirmSheet({ title: 'Switch to this version?', intro: 'The current transcript is kept as an earlier version. Citations in your notes become “moment in the recording” links, so they stay exact. AI explanations will be made again from this transcript.', ok: 'Switch' })) return;
  restoreVersion(L, d.v); closeSheet(); render(); toast('Switched. The other version is saved under “earlier versions”.');
};
