// App core: routing, rendering, event delegation, sheets, toasts. Views register themselves here.
import { D, touchRecent } from './store.js';
import { esc } from './lib.js';

export const $ = s => document.querySelector(s);
export const H = {};   // click handlers  (data-act="name")
export const HI = {};  // input handlers  (data-in="name")
export const HC = {};  // change handlers (data-ch="name")
export const V = {};   // the current view's parameters
const views = {};
const renderHooks = [];
export const register = (name, def) => { views[name] = def; };
export const onRender = fn => renderHooks.push(fn);
export const nav = { api: { llm: false, stt: null, extract: {} } }; // filled from /api/status

/* ---------- routes: #/  #/c/<course>/<tab>  #/l/<lecture>/<tab>  #/n/<note>  #/k/<concept>  #/inbox  #/s/<query> ---------- */
const enc = encodeURIComponent;
export function hashOf(n, p = {}) {
  switch (n) {
    case 'home': return '#/';
    case 'course': return '#/c/' + p.id + (p.tab && p.tab !== 'overview' ? '/' + p.tab + (p.sub ? '/' + p.sub : '') : '');
    case 'lec': return '#/l/' + p.id + '/' + (p.tab || 'orig') + (p.seg != null ? '?seg=' + p.seg : '');
    case 'note': return '#/n/' + p.id;
    case 'concept': return '#/k/' + p.id;
    case 'inbox': return '#/inbox';
    case 'search': return '#/s/' + enc(p.q || '');
    case 'add': return '#/add?' + new URLSearchParams(Object.fromEntries(['c', 'm', 'l'].filter(k => p[k]).map(k => [k, p[k]]))).toString();
    case 'rec': return '#/rec';
    case 'proc': return '#/proc/' + p.id;
    default: return '#/';
  }
}
export function parseHash(h) {
  const [path, qs] = String(h || '').replace(/^#\/?/, '').split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  const a = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (!a.length) return { n: 'home' };
  switch (a[0]) {
    case 'c': return { n: 'course', id: a[1], tab: a[2] || 'overview', sub: a[3] };
    case 'l': return { n: 'lec', id: a[1], tab: a[2] || 'orig', seg: q.seg != null ? +q.seg : null };
    case 'n': return { n: 'note', id: a[1] };
    case 'k': return { n: 'concept', id: a[1] };
    case 'inbox': return { n: 'inbox' };
    case 's': return { n: 'search', q: a[1] || '' };
    case 'add': return { n: 'add', c: q.c, m: q.m, l: q.l };
    case 'rec': return { n: 'rec' };
    case 'proc': return { n: 'proc', id: a[1] };
    default: return { n: 'home' };
  }
}
export function go(n, p = {}, opts = {}) {
  const h = hashOf(n, p);
  if (opts.replace) history.replaceState(null, '', h);
  else if (location.hash === h) { setView(parseHash(h)); render(); return; }
  else { location.hash = h; return; }
  setView(parseHash(h)); render();
}
function setView(o) { for (const k of Object.keys(V)) delete V[k]; Object.assign(V, o); }

/* ---------- render ---------- */
let lastKey = '';
export function render(opts = {}) {
  const def = views[V.n] || views.home;
  const key = V.n + ':' + (V.id || '') + ':' + (V.tab || '') + ':' + (V.sub || '');
  const y = window.scrollY, keep = key === lastKey && !opts.top;
  const out = def.html(V);
  if (out === false) return; // the view redirected
  $('#app').innerHTML = out;
  const rail = def.rail ? def.rail(V) : '';
  $('#rail').innerHTML = rail; document.body.classList.toggle('has-rail', !!rail);
  lastKey = key;
  document.body.dataset.view = V.n;
  document.title = (def.title ? def.title(V) + ' · ' : '') + 'Kitten Mode';
  renderHooks.forEach(f => { try { f(V); } catch (e) { console.error(e); } });
  if (def.after) def.after(V);
  if (keep) window.scrollTo(0, y); else if (!(def.keepTop)) window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { setView(parseHash(location.hash)); closeSheet(); render({ top: true }); });

/* ---------- event delegation ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.disabled) return;
  const f = H[el.dataset.act]; if (f) f(el.dataset, el, e);
});
document.addEventListener('input', e => { const el = e.target.closest('[data-in]'); if (el && HI[el.dataset.in]) HI[el.dataset.in](el, e); });
document.addEventListener('change', e => { const el = e.target.closest('[data-ch]'); if (el && HC[el.dataset.ch]) HC[el.dataset.ch](el, e); });

/* ---------- sheets (modal dialogs / bottom sheets) ---------- */
let askResolve = null, lastFocus = null;
export function sheet(html, opts = {}) {
  const s = $('#sheet');
  if (!s.firstChild) lastFocus = document.activeElement;
  s.innerHTML = `<div class="sheet" data-act="sheetBg"><div class="sheet-card${opts.wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.label || 'Dialog')}" tabindex="-1">${html}</div></div>`;
  const card = s.querySelector('.sheet-card');
  const first = card.querySelector('[autofocus],input:not([type=hidden]),textarea,select') || card;
  setTimeout(() => first.focus({ preventScroll: true }), 30);
}
export function closeSheet() {
  const s = $('#sheet'); if (!s) return;
  s.innerHTML = '';
  if (askResolve) { const r = askResolve; askResolve = null; r(null); }
  if (lastFocus && lastFocus.focus && document.contains(lastFocus)) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { } }
}
H.sheetBg = (d, el, e) => { if (e.target === el) closeSheet(); };
H.closeSheet = () => closeSheet();
document.addEventListener('keydown', e => {
  const s = $('#sheet'); if (!s || !s.firstChild) return;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
  if (e.key === 'Tab') { // keep focus inside the dialog
    const f = [...s.querySelectorAll('button,a[href],input,textarea,select,[tabindex]:not([tabindex="-1"])')].filter(x => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
});
const fieldHTML = f => {
  const id = esc(f.id), lab = `<span>${esc(f.label || '')}</span>`;
  if (f.type === 'textarea') return `<label class="fld">${lab}<textarea id="${id}" name="${id}" rows="${f.rows || 3}" placeholder="${esc(f.ph || '')}">${esc(f.value || '')}</textarea></label>`;
  if (f.type === 'select') return `<label class="fld">${lab}<select id="${id}" name="${id}">${(f.options || []).map(o => `<option value="${esc(o.v)}"${String(o.v) === String(f.value) ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`;
  if (f.type === 'hint') return `<p class="muted small">${f.html}</p>`;
  return `<label class="fld">${lab}<input id="${id}" name="${id}" type="${f.type || 'text'}" value="${esc(f.value || '')}" placeholder="${esc(f.ph || '')}"${f.required ? ' required' : ''}></label>`;
};
/* Small form dialog -> Promise of the values, or null if cancelled. */
export function ask({ title, intro = '', fields = [], ok = 'Save', danger = false, cancel = 'Cancel' }) {
  return new Promise(res => {
    sheet(`<h3>${esc(title)}</h3>${intro ? `<p class="muted">${intro}</p>` : ''}<form id="askform">${fields.map(fieldHTML).join('')}<div class="row" style="margin-top:14px"><button class="btn${danger ? ' danger' : ''}" type="submit">${esc(ok)}</button><button class="btn ghost" type="button" data-act="closeSheet">${esc(cancel)}</button></div></form>`, { label: title });
    askResolve = res;
    $('#askform').onsubmit = e => {
      e.preventDefault(); const f = e.target, vals = {};
      fields.forEach(x => { if (x.type !== 'hint') vals[x.id] = f.elements[x.id].value; });
      const r = askResolve; askResolve = null; closeSheet(); r(vals);
    };
  });
}
export const confirmSheet = o => ask(Object.assign({ fields: [], ok: 'Yes' }, o)).then(v => !!v);

/* ---------- toast ---------- */
export function toast(msg, action) {
  const t = $('#toast'); if (!t) return;
  t.innerHTML = `<div class="toast" role="status">${esc(msg)}${action ? ` <button class="link" data-act="${esc(action.act)}" data-id="${esc(action.id || '')}">${esc(action.label)}</button>` : ''}</div>`;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.innerHTML = ''; }, action ? 7000 : 3800);
}

/* ---------- theme ---------- */
export function applyTheme() { try { const t = localStorage.getItem('kitten.theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { } }
H.theme = () => {
  const r = document.documentElement, dark = r.dataset.theme === 'dark' || (r.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme:dark)').matches);
  r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('kitten.theme', r.dataset.theme); } catch (e) { }
};

/* ---------- API ---------- */
export const api = async (u, b) => { const r = await fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); if (!r.ok) throw new Error('api ' + r.status); return r.json(); };

/* Open any reference (transcript moment, material page, note, concept, task, lecture) at its exact location. */
export const openers = {}; // filled by views: seg/audio/material/note/concept/task/lecture
export function openRef(ref) { const f = openers[ref && ref.type]; if (f) f(ref); else toast('That source is no longer available.'); }
H.openRef = d => { try { openRef(JSON.parse(d.ref)); } catch (e) { toast('That source is no longer available.'); } };
export const refAttr = r => esc(JSON.stringify(r));
export { touchRecent, D };
