/* ui-core.js — utilitaires d'interface : création DOM, fenêtres, menus, boîtes de dialogue */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const SVGNS = 'http://www.w3.org/2000/svg';

/* h('div.classe#id', {attrs}, ...enfants) */
function h(tag, attrs, ...kids) {
  let svg = false; if (tag.startsWith('svg:')) { svg = true; tag = tag.slice(4); }
  const m = /^([a-zA-Z0-9]+)((?:[.#][\w-]+)*)$/.exec(tag);
  const el = svg ? document.createElementNS(SVGNS, m ? m[1] : tag) : document.createElement(m ? m[1] : tag);
  if (m && m[2]) m[2].replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === '.') el.classList.add(v); else el.id = v; });
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) for (const k in attrs) {
    const v = attrs[k]; if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', (el.getAttribute('class') ? el.getAttribute('class') + ' ' : '') + v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value' && !svg) el.value = v;
    else if (k === 'checked' && !svg) el.checked = !!v;
    else if (k === 'disabled' && !svg) el.disabled = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => { if (c === null || c === undefined || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return el;
}
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clear = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- toasts ---------- */
let toastBox = null;
function toast(msg, kind, ms) {
  if (!toastBox) toastBox = h('div#toasts', { role: 'status', 'aria-live': 'polite' }), document.body.appendChild(toastBox);
  const t = h('div.toast' + (kind ? '.' + kind : ''), msg); toastBox.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms || 3500);
}

/* ---------- menu contextuel ---------- */
let curMenu = null;
function closeMenu() { if (curMenu) { curMenu.remove(); curMenu = null; } }
function menu(x, y, items) {
  closeMenu();
  const m = h('div.ctxmenu', { role: 'menu' });
  items.forEach(it => {
    if (it === '-') { m.appendChild(h('div.sep')); return; }
    if (it.title) { m.appendChild(h('div.mtitle', it.title)); return; }
    m.appendChild(h('button.mitem', { role: 'menuitem', disabled: !!it.disabled, onclick: () => { closeMenu(); it.fn && it.fn(); } }, it.label));
  });
  document.body.appendChild(m); curMenu = m;
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px'; m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  setTimeout(() => document.addEventListener('mousedown', function f(e) { if (!m.contains(e.target)) { closeMenu(); } document.removeEventListener('mousedown', f); }, { once: false }), 0);
  return m;
}

/* ---------- dialogues ---------- */
function modal(title, body, buttons) {
  const back = h('div.modal-back');
  const box = h('div.modal', { role: 'dialog', 'aria-label': title }, h('h3', title), h('div.modal-body', body), h('div.modal-btns', (buttons || [{ label: 'Fermer' }]).map(b => h('button' + (b.primary ? '.primary' : ''), { onclick: () => { if (!b.fn || b.fn() !== false) back.remove(); } }, b.label))));
  back.appendChild(box); back.addEventListener('mousedown', e => { if (e.target === back) back.remove(); });
  document.body.appendChild(back);
  const f = box.querySelector('input,select,textarea'); if (f) f.focus();
  return back;
}
function ask(title, value, cb, label) {
  const inp = h('input', { type: 'text', value: value || '', style: { width: '100%' } });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const v = inp.value; inp.closest('.modal-back').remove(); cb(v); } });
  modal(title, [label ? h('label', label) : null, inp], [{ label: 'Annuler' }, { label: 'OK', primary: true, fn: () => { cb(inp.value); } }]);
  inp.select();
}
function confirmBox(title, msg, cb) { modal(title, h('p', msg), [{ label: 'Annuler' }, { label: 'Confirmer', primary: true, fn: () => { cb(); } }]); }

/* ---------- fenêtres flottantes ---------- */
let zTop = 50; const wins = new Map();
function openWindow(o) {
  if (o.id && wins.has(o.id)) { const w = wins.get(o.id); w.el.style.display = ''; focus(w); return w; }
  const layer = $('#winlayer');
  const title = h('span.wtitle', o.title || '');
  const closeBtn = h('button.wclose', { 'aria-label': 'Fermer', title: 'Fermer', onclick: () => w.close() }, '×');
  const minBtn = h('button.wmin', { 'aria-label': 'Réduire', title: 'Réduire', onclick: () => { w.el.classList.toggle('min'); } }, '–');
  const head = h('div.whead', title, h('span.wbtns', minBtn, closeBtn));
  const body = h('div.wbody');
  const el = h('div.win', { role: 'dialog', 'aria-label': o.title || 'Fenêtre', style: { left: (o.x || 120 + wins.size * 26) + 'px', top: (o.y || 80 + wins.size * 26) + 'px', width: (o.w || 560) + 'px', height: (o.h || 400) + 'px' } }, head, body);
  layer.appendChild(el);
  const w = { el, body, title, id: o.id, onClose: o.onClose, close() { if (this.onClose) this.onClose(); el.remove(); if (o.id) wins.delete(o.id); }, setTitle(t) { title.textContent = t; } };
  if (o.id) wins.set(o.id, w);
  el.addEventListener('mousedown', () => focus(w));
  let drag = null;
  head.addEventListener('mousedown', e => { if (e.target.closest('button')) return; drag = { x: e.clientX - el.offsetLeft, y: e.clientY - el.offsetTop }; e.preventDefault(); });
  document.addEventListener('mousemove', e => { if (!drag) return; el.style.left = Math.max(-200, Math.min(innerWidth - 60, e.clientX - drag.x)) + 'px'; el.style.top = Math.max(0, Math.min(innerHeight - 30, e.clientY - drag.y)) + 'px'; });
  document.addEventListener('mouseup', () => { drag = null; });
  head.addEventListener('dblclick', () => el.classList.toggle('max'));
  focus(w);
  return w;
}
function focus(w) { w.el.style.zIndex = ++zTop; $$('.win.focus').forEach(x => x.classList.remove('focus')); w.el.classList.add('focus'); }
function closeWindow(id) { const w = wins.get(id); if (w) w.close(); }
function closeAllWindows() { Array.from(wins.values()).forEach(w => w.close()); }

/* ---------- onglets ---------- */
function tabs(defs, opts) {
  const bar = h('div.tabbar', { role: 'tablist' }), body = h('div.tabbody'); const map = {};
  const root = h('div.tabs', bar, body);
  function show(id) {
    Object.keys(map).forEach(k => { map[k].btn.classList.toggle('on', k === id); map[k].btn.setAttribute('aria-selected', k === id); });
    clear(body); const d = map[id].def; const c = d.render(); body.appendChild(c); root.current = id; if (d.onShow) d.onShow(c);
    if (opts && opts.onChange) opts.onChange(id);
  }
  defs.forEach(d => { const btn = h('button.tab', { role: 'tab', onclick: () => show(d.id) }, d.label); map[d.id] = { btn, def: d }; bar.appendChild(btn); });
  root.show = show; root.body = body;
  if (defs.length) show((opts && opts.first) || defs[0].id);
  return root;
}
/* champ de formulaire étiqueté */
function field(label, input, hint) { return h('label.fld', h('span', label), input, hint ? h('small', hint) : null); }

NS.h = h; NS.$ = $; NS.$$ = $$; NS.clear = clear; NS.esc = esc;
NS.ui = { toast, menu, closeMenu, modal, ask, confirmBox, openWindow, closeAllWindows, closeWindow, tabs, field };
})(typeof window !== 'undefined' ? window : globalThis);
