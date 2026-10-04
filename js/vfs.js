/* vfs.js — système de fichiers virtuel (hôte, conteneurs, volumes) avec points de montage */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const dir = () => ({ t: 'd', c: {} });
const file = (d, m) => ({ t: 'f', d: d === undefined ? '' : String(d), m: m || '-rw-r--r--' });

class VFS {
  constructor(root) { this.root = root || dir(); this.mounts = []; this.home = '/root'; }
  /* chemin absolu normalisé à partir d'un répertoire courant */
  norm(cwd, p) {
    if (p === '~' || (p || '').startsWith('~/')) p = this.home + p.slice(1);
    const parts = (p.startsWith('/') ? p : (cwd || '/') + '/' + p).split('/'); const out = [];
    for (const s of parts) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); }
    return '/' + out.join('/');
  }
  /* résout les montages : renvoie { fs, path } */
  locate(path) {
    let best = null;
    for (const m of this.mounts) if ((path === m.path || path.startsWith(m.path === '/' ? '/' : m.path + '/')) && (!best || m.path.length > best.path.length)) best = m;
    if (!best) return { fs: this, path };
    const rest = path.slice(best.path.length);
    return best.vfs.locate(this._join(best.sub, rest));
  }
  _join(a, b) { const s = (a === '/' ? '' : a) + (b || ''); return s || '/'; }
  _walk(path, create) {
    let n = this.root; const parts = path.split('/').filter(Boolean);
    for (const p of parts) { if (n.t !== 'd') return null; if (!n.c[p]) { if (!create) return null; n.c[p] = dir(); } n = n.c[p]; }
    return n;
  }
  get(path) { const l = this.locate(path); return l.fs._walk(l.path, false); }
  exists(path) { return !!this.get(path); }
  isDir(path) { const n = this.get(path); return !!n && n.t === 'd'; }
  isFile(path) { const n = this.get(path); return !!n && n.t === 'f'; }
  read(path) { const n = this.get(path); return n && n.t === 'f' ? n.d : null; }
  list(path) {
    const l = this.locate(path); const n = l.fs._walk(l.path, false); if (!n || n.t !== 'd') return null;
    const names = Object.keys(n.c);
    for (const m of this.mounts) { const pp = path === '/' ? '' : path; if (m.path.startsWith(pp + '/')) { const nm = m.path.slice(pp.length + 1).split('/')[0]; if (nm && !names.includes(nm)) names.push(nm); } }
    return names.sort();
  }
  mkdirp(path) { const l = this.locate(path); return l.fs._walk(l.path, true); }
  write(path, data, append) {
    const l = this.locate(path); const idx = l.path.lastIndexOf('/'); const parent = l.path.slice(0, idx) || '/'; const name = l.path.slice(idx + 1);
    const pn = l.fs._walk(parent, false); if (!pn || pn.t !== 'd') return false;
    const ex = pn.c[name]; if (ex && ex.t === 'd') return false;
    if (ex && append) ex.d += data; else pn.c[name] = file(data, ex && ex.m);
    return true;
  }
  writep(path, data) { const idx = path.lastIndexOf('/'); this.mkdirp(path.slice(0, idx) || '/'); return this.write(path, data); }
  remove(path, recursive) {
    const l = this.locate(path); const idx = l.path.lastIndexOf('/'); const parent = l.path.slice(0, idx) || '/'; const name = l.path.slice(idx + 1);
    const pn = l.fs._walk(parent, false); if (!pn || !pn.c[name]) return false;
    if (pn.c[name].t === 'd' && !recursive) return false;
    delete pn.c[name]; return true;
  }
  mount(path, vfs, sub, ro) { this.mkdirp(path); this.mounts.push({ path, vfs, sub: sub || '/', ro: !!ro }); }
  /* le chemin se trouve-t-il sous un montage en lecture seule ? */
  isRo(path) {
    let best = null;
    for (const m of this.mounts) if ((path === m.path || path.startsWith(m.path === '/' ? '/' : m.path + '/')) && (!best || m.path.length > best.path.length)) best = m;
    if (!best) return false; if (best.ro) return true;
    return best.vfs.isRo(this._join(best.sub, path.slice(best.path.length)));
  }
  size(path) { const n = this.get(path); if (!n) return 0; const f = x => x.t === 'f' ? x.d.length : Object.values(x.c).reduce((a, y) => a + f(y), 4096); return f(n); }
  /* copie profonde d'un sous-arbre (hors montages) */
  static clone(node) { return JSON.parse(JSON.stringify(node)); }
  clone() { return new VFS(VFS.clone(this.root)); }
  /* construit un arbre à partir d'un objet { '/chemin/fichier': contenu } */
  static from(files) {
    const v = new VFS();
    for (const p in files) { const idx = p.lastIndexOf('/'); v.mkdirp(p.slice(0, idx) || '/'); if (files[p] === null) v.mkdirp(p); else v.write(p, files[p]); }
    return v;
  }
  /* est-ce que le dossier est vide ? */
  isEmpty(path) { const l = this.list(path); return !l || l.length === 0; }
  copyTree(srcPath, dst, dstPath) {
    const n = this.get(srcPath); if (!n) return;
    const walk = (node, p) => { if (node.t === 'f') dst.write(p, node.d); else { dst.mkdirp(p); for (const k in node.c) walk(node.c[k], (p === '/' ? '' : p) + '/' + k); } };
    if (n.t === 'f') dst.write(dstPath, n.d); else for (const k in n.c) walk(n.c[k], (dstPath === '/' ? '' : dstPath) + '/' + k);
  }
}
NS.VFS = VFS;
})(typeof window !== 'undefined' ? window : globalThis);
