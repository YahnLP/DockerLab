/* util.js — primitives : formats Docker (tailles, durées, tableaux), générateur pseudo-aléatoire, découpage de ligne de commande */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const U = NS.U = {};

/* ---------- aléatoire déterministe (tests reproductibles) ---------- */
U.rng = function (seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
};
U.hash32 = function (s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
U.hexOf = function (seed, n) { const r = U.rng(U.hash32(seed)); let o = ''; while (o.length < n) o += Math.floor(r() * 16).toString(16); return o; };

/* ---------- tailles et durées (même rendu que go-units, utilisé par Docker) ---------- */
U.humanSize = function (b) {
  const u = ['B', 'kB', 'MB', 'GB', 'TB']; let i = 0, v = b;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return String(Number(v.toPrecision(3))) + u[i];
};
U.humanDuration = function (ms) {
  const s = Math.floor(ms / 1000);
  if (s < 1) return 'Less than a second';
  if (s === 1) return '1 second';
  if (s < 60) return s + ' seconds';
  const m = Math.floor(s / 60);
  if (m === 1) return 'About a minute';
  if (m < 60) return m + ' minutes';
  const h = Math.round(ms / 3600000);
  if (h === 1) return 'About an hour';
  if (h < 48) return h + ' hours';
  if (h < 24 * 7 * 2) return Math.floor(h / 24) + ' days';
  if (h < 24 * 30 * 2) return Math.floor(h / 24 / 7) + ' weeks';
  if (h < 24 * 365 * 2) return Math.floor(h / 24 / 30) + ' months';
  return Math.floor(h / 24 / 365) + ' years';
};

/* ---------- dates ---------- */
const p2 = n => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
U.iso = ms => { const d = new Date(ms); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + 'T' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + '.' + String(Math.floor(ms % 1000)).padStart(3, '0') + '000000Z'; };
U.isoShort = ms => { const d = new Date(ms); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + ' +0000 UTC'; };
U.httpDate = ms => { const d = new Date(ms); return DOW[d.getUTCDay()] + ', ' + p2(d.getUTCDate()) + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + ' GMT'; };
U.nginxAccess = ms => { const d = new Date(ms); return p2(d.getUTCDate()) + '/' + MON[d.getUTCMonth()] + '/' + d.getUTCFullYear() + ':' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + ' +0000'; };
U.nginxError = ms => { const d = new Date(ms); return d.getUTCFullYear() + '/' + p2(d.getUTCMonth() + 1) + '/' + p2(d.getUTCDate()) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()); };
U.redisTime = ms => { const d = new Date(ms); return p2(d.getUTCDate()) + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + '.' + String(Math.floor(ms % 1000)).padStart(3, '0'); };
U.pgTime = ms => { const d = new Date(ms); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + '.' + String(Math.floor(ms % 1000)).padStart(3, '0') + ' UTC'; };
U.dateLine = ms => { const d = new Date(ms); return DOW[d.getUTCDay()] + ' ' + MON[d.getUTCMonth()] + ' ' + String(d.getUTCDate()).padStart(2, ' ') + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + ' UTC ' + d.getUTCFullYear(); };
U.apacheTime = ms => { const d = new Date(ms); return DOW[d.getUTCDay()] + ' ' + MON[d.getUTCMonth()] + ' ' + p2(d.getUTCDate()) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + '.' + String(Math.floor(ms % 1000)).padStart(3, '0') + '000 ' + d.getUTCFullYear(); };

/* ---------- tableaux alignés comme le tabwriter de Docker (minwidth 10, padding 3) ---------- */
U.table = function (rows) {
  if (!rows.length) return '';
  const nc = Math.max.apply(null, rows.map(r => r.length)); const w = [];
  for (let c = 0; c < nc - 1; c++) { let m = 0; rows.forEach(r => { m = Math.max(m, String(r[c] === undefined ? '' : r[c]).length); }); w.push(Math.max(10, m + 3)); }
  return rows.map(r => r.map((x, c) => c < r.length - 1 ? String(x).padEnd(w[c]) : String(x)).join('')).join('\n') + '\n';
};

/* ---------- gabarits Go minimalistes : {{.A.B}}, {{json .A}}, {{.A.B.C}} ---------- */
U.getPath = function (obj, path) {
  let v = obj; const parts = path.replace(/^\./, '').split('.').filter(Boolean);
  for (const p of parts) { if (v === null || v === undefined) return undefined; v = v[p]; }
  return v;
};
U.goTemplate = function (tpl, obj) {
  tpl = String(tpl).replace(/\\t/g, '\t').replace(/\\n/g, '\n');
  const render = (t, o, vars) => {
    t = t.replace(/\{\{\s*range\s+(?:\$(\w+)\s*,\s*\$(\w+)\s*:=\s*)?([^}]+?)\s*\}\}([\s\S]*?)\{\{\s*end\s*\}\}/g, (m, kv, vv, path, body) => {
      const coll = U.getPath(o, path.trim()); if (!coll) return '';
      const entries = Array.isArray(coll) ? coll.map((x, i) => [i, x]) : Object.keys(coll).map(k => [k, coll[k]]);
      return entries.map(([k, v]) => render(body, v, Object.assign({}, vars, kv ? { [kv]: k } : {}, vv ? { [vv]: v } : {}))).join('');
    });
    return t.replace(/\{\{\s*([^}]*?)\s*\}\}/g, (m, e) => {
      let json = false; if (/^json\s+/.test(e)) { json = true; e = e.replace(/^json\s+/, ''); }
      if (/^len\s+/.test(e)) { const v = U.getPath(o, e.replace(/^len\s+/, '')); return String(v ? (Array.isArray(v) ? v.length : Object.keys(v).length) : 0); }
      let v;
      if (e[0] === '$') { const mm = /^\$(\w+)((?:\.\w+)*)$/.exec(e); if (!mm || !(mm[1] in vars)) return ''; v = mm[2] ? U.getPath(vars[mm[1]], mm[2]) : vars[mm[1]]; }
      else if (e === '.') v = o; else v = U.getPath(o, e);
      if (json) return JSON.stringify(v === undefined ? null : v);
      if (v === undefined || v === null) return '<no value>';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    });
  };
  return render(tpl, obj, {});
};

/* ---------- analyse de ligne de commande (guillemets, $VAR, $(…), |, &&, ||, ;, >, >>) ---------- */
/* renvoie une liste de commandes : { words:[ [{t,m}] ], redir:[{op,target}], sep: ';'|'&&'|'||'|'|'|null } ; m = 'p' (nu) | 's' (simple) | 'd' (double) */
U.parseLine = function (line) {
  const cmds = []; let cur = { words: [], redir: [], sep: null }; let word = null; let i = 0; const n = line.length;
  const pushWord = () => { if (word) { const r = cur.redir[cur.redir.length - 1]; if (r && r.target === null && !r.done) r.target = word; else cur.words.push(word); word = null; } };
  const addTxt = (t, m) => { if (!word) word = []; const last = word[word.length - 1]; if (last && last.m === m) last.t += t; else word.push({ t, m }); };
  const endCmd = sep => { pushWord(); cur.sep = sep; cmds.push(cur); cur = { words: [], redir: [], sep: null }; };
  while (i < n) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t') { pushWord(); i++; continue; }
    if (ch === '#' && !word) break;
    if (ch === "'") { const j = line.indexOf("'", i + 1); if (j < 0) throw new Error("unexpected EOF while looking for matching `''"); if (!word) word = []; addTxt(line.slice(i + 1, j), 's'); i = j + 1; continue; }
    if (ch === '"') {
      let j = i + 1, buf = '';
      while (j < n && line[j] !== '"') {
        if (line[j] === '\\' && j + 1 < n && '"\\$`'.indexOf(line[j + 1]) >= 0) { buf += line[j + 1]; j += 2; continue; }
        if (line[j] === '$' && line[j + 1] === '(') { let d = 1, k = j + 2; while (k < n && d) { if (line[k] === '(') d++; else if (line[k] === ')') d--; k++; } buf += line.slice(j, k); j = k; continue; }
        buf += line[j++];
      }
      if (j >= n) throw new Error("unexpected EOF while looking for matching `\"'");
      if (!word) word = []; addTxt(buf, 'd'); i = j + 1; continue;
    }
    if (ch === '\\' && i + 1 < n) { addTxt(line[i + 1], 's'); i += 2; continue; }
    if (ch === '$' && line[i + 1] === '(') { let d = 1, k = i + 2; while (k < n && d) { if (line[k] === '(') d++; else if (line[k] === ')') d--; k++; } addTxt(line.slice(i, k), 'p'); i = k; continue; }
    if (ch === '|') { if (line[i + 1] === '|') { endCmd('||'); i += 2; } else { endCmd('|'); i++; } continue; }
    if (ch === '&') { if (line[i + 1] === '&') { endCmd('&&'); i += 2; continue; } if (line[i + 1] === '>') { pushWord(); cur.redir.push({ op: '&>', target: null }); i += 2; continue; } addTxt('&', 'p'); i++; continue; }
    if (ch === ';') { endCmd(';'); i++; continue; }
    if (ch === '>' || (ch === '2' && line[i + 1] === '>' && !word)) {
      let fd = 1; if (ch === '2') { fd = 2; i++; }
      pushWord();
      let op = '>'; i++; if (line[i] === '>') { op = '>>'; i++; }
      if (line[i] === '&' && line[i + 1] === '1') { cur.redir.push({ op: fd + '>&1', target: null, done: true }); i += 2; continue; }
      cur.redir.push({ op: fd === 2 ? '2' + op : op, target: null }); continue;
    }
    addTxt(ch, 'p'); i++;
  }
  pushWord();
  if (cur.words.length || cur.redir.length || cmds.length === 0) { cur.sep = null; cmds.push(cur); }
  return cmds;
};

U.shellSplit = function (s) { const c = U.parseLine(s); return c.length && c[0].words.map(w => w.map(x => x.t).join('')); };
})(typeof window !== 'undefined' ? window : globalThis);
