/* term.js — terminal branché sur une session Docker Lab (hôte, shell de conteneur, redis-cli…) */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const { h, clear } = NS;

NS.Terminal = function (sess, opts) {
  opts = opts || {};
  const out = h('pre.tout', { tabindex: '-1' });
  const prompt = h('span.tprompt');
  const inp = h('input.tin', { type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Ligne de commande' });
  const line = h('div.tline', prompt, inp);
  const root = h('div.term', { onclick: () => { if (!window.getSelection().toString()) inp.focus(); } }, out, line);
  let busy = false, hist = sess.history, hi = hist.length, buf = '', lastCh = '\n';
  function print(t) { if (!t) return; lastCh = t[t.length - 1]; out.appendChild(document.createTextNode(t)); if (out.childNodes.length > 1500) out.removeChild(out.firstChild); scroll(); }
  function scroll() { root.scrollTop = root.scrollHeight; }
  function setPrompt() { if (lastCh !== '\n') print('\n'); prompt.textContent = sess.prompt(); inp.type = sess.masking ? 'password' : 'text'; scroll(); }
  const io = {
    print, clear() { clear(out); lastCh = '\n'; },
    done() { busy = false; setPrompt(); if (opts.focus !== false) inp.focus({ preventScroll: true }); if (opts.onIdle) opts.onIdle(); },
  };
  function run(l) {
    print(sess.prompt() + l + '\n');
    busy = true; hist = sess.history; hi = hist.length;
    try { sess.exec(l, io); } catch (e) { print('[erreur interne du simulateur : ' + e.message + ']\n'); console.error(e); io.done(); }
    if (sess.closed) { print('logout\n[Session terminée — appuyez sur Entrée pour rouvrir un terminal]\n'); sess.closed = false; busy = false; setPrompt(); }
    if (opts.onRun) opts.onRun(l);
  }
  inp.addEventListener('keydown', e => {
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      if (window.getSelection().toString()) return;
      if (busy) { sess.abort(); print('^C\n'); busy = false; setPrompt(); } else { print(sess.prompt() + inp.value + '^C\n'); inp.value = ''; setPrompt(); }
      e.preventDefault(); return;
    }
    if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { io.clear(); setPrompt(); e.preventDefault(); return; }
    if (e.ctrlKey && (e.key === 'd' || e.key === 'D') && !busy && !inp.value) { run('exit'); e.preventDefault(); return; }
    if (e.key === 'Enter') {
      if (busy && !sess.remote) { e.preventDefault(); return; }
      const l = inp.value; inp.value = ''; run(l); e.preventDefault(); return;
    }
    if (e.key === 'ArrowUp') { if (hi > 0) { if (hi === hist.length) buf = inp.value; hi--; inp.value = hist[hi]; } e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { if (hi < hist.length) { hi++; inp.value = hi === hist.length ? buf : hist[hi]; } e.preventDefault(); return; }
    if (e.key === 'Tab' && !busy) {
      e.preventDefault(); const r = sess.complete(inp.value);
      if (typeof r === 'string') inp.value = r; else if (Array.isArray(r)) print(sess.prompt() + inp.value + '\n' + r.join('  ') + '\n');
      return;
    }
  });
  const api = {
    el: root, session: sess, focus() { inp.focus(); },
    insert(text) { inp.value = text; inp.focus(); },
    /* exécute des commandes comme si l'utilisateur les tapait (une par une, en attendant la fin de chacune) */
    runLines(lines, then) {
      const arr = Array.isArray(lines) ? lines.slice() : [lines];
      const step = () => { if (!arr.length) { if (then) then(); return; } if (busy && !sess.remote) { setTimeout(step, 80); return; } run(arr.shift()); setTimeout(step, 30); };
      step();
    },
    get busy() { return busy; },
  };
  print('Docker Lab — terminal de l\'hôte (Ubuntu 24.04). Tapez « docker --help » ou suivez le sujet de TP.\nTab : compléter · ↑ : historique · Ctrl+C : interrompre · Ctrl+L : effacer · Ctrl+D : quitter un shell\n\n');
  setPrompt();
  return api;
};
})(typeof window !== 'undefined' ? window : globalThis);
