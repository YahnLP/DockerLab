/* yaml.js — sous-ensemble de YAML suffisant pour les fichiers Compose : maps, listes, scalaires, guillemets, [..] et {..}, | et >, commentaires. */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};

class YamlError extends Error { constructor(line, msg) { super('yaml: line ' + line + ': ' + msg); this.line = line; } }

function stripComment(s) { let q = null; for (let i = 0; i < s.length; i++) { const c = s[i]; if (q) { if (c === q) q = null; else if (c === '\\' && q === '"') i++; } else if (c === '"' || c === "'") { if (i === 0 || /[\s:\[,{-]/.test(s[i - 1])) q = c; } else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i); } return s; }
function splitFlow(s) { const out = []; let d = 0, q = null, cur = ''; for (const c of s) { if (q) { cur += c; if (c === q) q = null; continue; } if (c === '"' || c === "'") { q = c; cur += c; continue; } if (c === '[' || c === '{') d++; if (c === ']' || c === '}') d--; if (c === ',' && d === 0) { out.push(cur); cur = ''; } else cur += c; } if (cur.trim()) out.push(cur); return out; }
function scalar(s, ln) {
  s = s.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s[0] === '"') { if (s.length < 2 || s[s.length - 1] !== '"') throw new YamlError(ln, 'found unexpected end of stream while scanning a quoted scalar'); return s.slice(1, -1).replace(/\\(["\\nt])/g, (m, c) => c === 'n' ? '\n' : c === 't' ? '\t' : c); }
  if (s[0] === "'") { if (s.length < 2 || s[s.length - 1] !== "'") throw new YamlError(ln, 'found unexpected end of stream while scanning a quoted scalar'); return s.slice(1, -1).replace(/''/g, "'"); }
  if (s[0] === '[') { if (s[s.length - 1] !== ']') throw new YamlError(ln, 'did not find expected \',\' or \']\''); return splitFlow(s.slice(1, -1)).map(x => scalar(x, ln)); }
  if (s[0] === '{') { if (s[s.length - 1] !== '}') throw new YamlError(ln, 'did not find expected \',\' or \'}\''); const o = {}; splitFlow(s.slice(1, -1)).forEach(kv => { const i = kv.indexOf(':'); if (i < 0) throw new YamlError(ln, 'did not find expected \',\' or \'}\''); o[scalar(kv.slice(0, i), ln)] = scalar(kv.slice(i + 1), ln); }); return o; }
  if (/^(true|True|TRUE)$/.test(s)) return true; if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^-?\d+$/.test(s) && s.length < 16) return Number(s); if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  return s;
}
function keySplit(t) { /* "clé: valeur" → [clé, reste] ou null */ let q = null; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === q) q = null; continue; } if (c === '"' || c === "'") { q = c; continue; } if (c === ':' && (i === t.length - 1 || t[i + 1] === ' ')) return [t.slice(0, i).trim(), t.slice(i + 1).trim()]; } return null; }

function parse(text) {
  if (/^\t|\n\t/.test(text.replace(/\r/g, ''))) { const ln = text.replace(/\r/g, '').split('\n').findIndex(l => /^\t/.test(l)) + 1; throw new YamlError(ln, 'found character that cannot start any token'); }
  const raw = text.replace(/\r/g, '').split('\n');
  const L = []; raw.forEach((r, i) => { const t = stripComment(r).replace(/\s+$/, ''); if (/^\s*$/.test(t) || /^---\s*$/.test(t)) return; L.push({ ind: t.length - t.trimStart().length, t: t.trim(), n: i + 1, raw: r }); });
  let pos = 0;
  function block(ind) {
    if (pos >= L.length) return null;
    const first = L[pos]; if (first.t === '-' || first.t.startsWith('- ')) return list(first.ind); return map(first.ind);
  }
  function value(rest, ind, ln) {
    if (rest === '|' || rest === '>' || /^[|>][+-]?$/.test(rest)) {
      /* bloc littéral : lignes brutes plus indentées */
      const startRaw = L[pos - 1].n; const lines = []; let bi = -1; let k = startRaw;
      while (k < raw.length) { const r = raw[k]; if (/^\s*$/.test(r)) { lines.push(''); k++; continue; } const i2 = r.length - r.trimStart().length; if (i2 <= ind) break; if (bi < 0) bi = i2; lines.push(r.slice(Math.min(bi, i2))); k++; }
      while (lines.length && lines[lines.length - 1] === '') lines.pop();
      while (pos < L.length && L[pos].n <= k) pos++;
      const body = rest[0] === '>' ? lines.join(' ').replace(/\s+\n/g, '\n') : lines.join('\n');
      return rest.endsWith('-') ? body : body + '\n';
    }
    if (rest === '') { if (pos < L.length && (L[pos].ind > ind || (L[pos].ind === ind && (L[pos].t === '-' || L[pos].t.startsWith('- ')) && L[pos - 1] && !L[pos - 1].t.startsWith('- ')))) return block(L[pos].ind); return null; }
    if (rest[0] === '&' || rest[0] === '*') throw new YamlError(ln, 'ancres et alias non gérés par Docker Lab');
    return scalar(rest, ln);
  }
  function map(ind) {
    const o = {};
    while (pos < L.length) {
      const l = L[pos]; if (l.ind < ind) break;
      if (l.ind > ind) throw new YamlError(l.n, 'mapping values are not allowed in this context');
      if (l.t === '-' || l.t.startsWith('- ')) break;
      const kv = keySplit(l.t); if (!kv) throw new YamlError(l.n, 'could not find expected \':\'');
      const key = String(scalar(kv[0], l.n)); if (key in o) throw new YamlError(l.n, 'mapping key "' + key + '" already defined at line ' + l.n);
      pos++; o[key] = value(kv[1], ind, l.n);
    }
    return o;
  }
  function list(ind) {
    const a = [];
    while (pos < L.length) {
      const l = L[pos]; if (l.ind !== ind || !(l.t === '-' || l.t.startsWith('- '))) { if (l.ind > ind) throw new YamlError(l.n, 'did not find expected \'-\' indicator'); break; }
      const rest = l.t === '-' ? '' : l.t.slice(2).trim();
      if (rest === '') { pos++; a.push(pos < L.length && L[pos].ind > ind ? block(L[pos].ind) : null); continue; }
      const kv = rest[0] !== '"' && rest[0] !== "'" && rest[0] !== '[' && rest[0] !== '{' ? keySplit(rest) : null;
      if (kv) { /* élément « - clé: valeur » : on réécrit la ligne comme un début de map plus indenté */ const off = l.t.length - rest.length; L[pos] = { ind: ind + off, t: rest, n: l.n, raw: l.raw }; a.push(map(ind + off)); }
      else { pos++; a.push(scalar(rest, l.n)); }
    }
    return a;
  }
  if (!L.length) return null;
  const r = block(L[0].ind);
  if (pos < L.length) throw new YamlError(L[pos].n, 'did not find expected <document start>');
  return r;
}

/* ---- sérialisation façon « docker compose config » */
function dumpScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (s === '' || /^(true|false|null|yes|no|~)$/i.test(s) || /^-?\d+(\.\d+)?$/.test(s) || /^[\s\-?:,\[\]{}#&*!|>'"%@`]|[:#]\s|\s$|: /.test(s) || /:$/.test(s)) return JSON.stringify(s);
  return s;
}
function dump(v, ind) {
  ind = ind || 0; const pad = ' '.repeat(ind); let out = '';
  if (Array.isArray(v)) {
    v.forEach(x => {
      if (x && typeof x === 'object' && !Array.isArray(x)) { const d = dump(x, ind + 2).split('\n'); out += pad + '- ' + d[0].trimStart() + '\n' + d.slice(1).filter((l, i, a) => i < a.length - 1 || l).join('\n') + (d.length > 1 ? '\n' : ''); }
      else if (Array.isArray(x)) out += pad + '- ' + JSON.stringify(x) + '\n';
      else out += pad + '- ' + dumpScalar(x) + '\n';
    });
    return out.replace(/\n\n+/g, '\n');
  }
  Object.keys(v).forEach(k => {
    const x = v[k];
    if (x && typeof x === 'object' && (Array.isArray(x) ? x.length : Object.keys(x).length)) out += pad + k + ':\n' + dump(x, ind + 2);
    else if (Array.isArray(x)) out += pad + k + ': []\n';
    else if (x && typeof x === 'object') out += pad + k + ': {}\n';
    else out += pad + k + ': ' + dumpScalar(x) + '\n';
  });
  return out;
}
NS.yaml = { parse, dump, YamlError };
})(typeof window !== 'undefined' ? window : globalThis);
