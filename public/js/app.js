// Entry point: open the store, load the vocabulary, wire the views, show the first page.
import { init, D } from './store.js';
import { restoreConcepts } from './kb.js';
import { watchEmoji } from './pixel.js';
import { $, V, applyTheme, nav, render, parseHash, go } from './core.js';
import './ui.js'; import './shell.js'; import './player.js'; import './actions.js';
import './v-tasks.js'; import './v-materials.js'; import './v-capture.js'; import './v-lecture.js'; import './v-notes.js'; import './v-home.js'; import './v-search.js'; import './select.js';

applyTheme();
try { watchEmoji(); } catch (e) { }
(async () => {
  try {
    await init();
    restoreConcepts(D.lectures);
    for (const k of Object.keys(V)) delete V[k]; Object.assign(V, parseHash(location.hash));
    render({ top: true });
  } catch (e) {
    console.error(e);
    $('#app').innerHTML = `<div class="err" role="alert">Something went wrong while opening your library: ${String(e.message || e).replace(/</g, '&lt;')}. Your data on this device was not touched. Reload the page to try again.</div>`;
    return;
  }
  fetch('/api/status').then(r => r.json()).then(j => { nav.api.llm = !!j.llm; nav.api.stt = j.stt || null; nav.api.extract = j.extract || {}; render(); }).catch(() => { });
})();
