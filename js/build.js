/* build.js — Dockerfile : analyse, `docker build` (BuildKit simulé : cache, multi-stage, .dockerignore), `docker history`, `docker commit` */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const { U, VFS, DockerError, Shell } = NS;
const SUB = NS.dockerSub; const parseFlags = NS.dockerParseFlags; const { dErr, why } = NS.dockerHelpers;
const q = a => "'" + String(a).replace(/'/g, "'\\''") + "'";
const KNOWN = ['FROM', 'RUN', 'CMD', 'LABEL', 'MAINTAINER', 'EXPOSE', 'ENV', 'ADD', 'COPY', 'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL', 'HEALTHCHECK', 'SHELL'];

/* ------------------------------------------------ analyse du Dockerfile */
function parseDockerfile(text) {
  const lines = String(text).replace(/\r/g, '').split('\n'); const out = []; let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim(); const start = i + 1;
    if (!t || t[0] === '#') { i++; continue; }
    let full = lines[i];
    while (/\\\s*$/.test(full) && i + 1 < lines.length) {
      full = full.replace(/\\\s*$/, ''); i++;
      while (i < lines.length && (lines[i].trim()[0] === '#')) i++;
      if (i < lines.length) full += lines[i];
    }
    const m = /^\s*(\S+)\s*([\s\S]*)$/.exec(full); out.push({ kw: m[1].toUpperCase(), raw: m[1], args: m[2].trim(), line: start, end: i + 1, text: m[1].toUpperCase() + ' ' + m[2].trim() });
    i++;
  }
  return out;
}
function jsonArr(s) { if (s[0] !== '[') return null; try { const a = JSON.parse(s); if (Array.isArray(a) && a.every(x => typeof x === 'string')) return a; } catch (e) { } return null; }
function goArr(a) { return '[' + a.map(x => JSON.stringify(x)).join(' ') + ']'; }
function expand(s, env) {
  return s.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)(?::?([-+])([^}]*))?\}|([A-Za-z_][A-Za-z0-9_]*))/g, (m, a, op, w, b) => {
    const k = a || b; const v = env[k];
    if (op === '-') return v !== undefined && v !== '' ? v : w; if (op === '+') return v !== undefined && v !== '' ? w : '';
    return v === undefined ? '' : v;
  });
}
function kvPairs(args) {
  const toks = U.shellSplit(args) || []; const out = [];
  if (toks.length && toks[0].indexOf('=') > 0) { toks.forEach(t => { const i = t.indexOf('='); if (i > 0) out.push([t.slice(0, i), t.slice(i + 1)]); }); return out; }
  if (toks.length >= 2) return [[toks[0], args.replace(/^\S+\s+/, '').replace(/^"(.*)"$/, '$1')]];
  return out;
}
function envMapOf(arr) { const m = {}; arr.forEach(e => { const i = e.indexOf('='); m[i < 0 ? e : e.slice(0, i)] = i < 0 ? '' : e.slice(i + 1); }); return m; }
function setEnv(arr, k, v) { const i = arr.findIndex(e => e.split('=')[0] === k); if (i >= 0) arr[i] = k + '=' + v; else arr.push(k + '=' + v); }
const hms = ms => (ms / 1000).toFixed(1) + 's';
const PKG_BYTES = { apk: 2400000, apt: 24000000, pip: 11000000, npm: 15000000 };
function pkgBytes(before, after) { let n = 0; Object.keys(after).forEach(k => { if (after[k] && !before[k]) n += /^pip:/.test(k) ? PKG_BYTES.pip : /^npm:/.test(k) ? PKG_BYTES.npm : PKG_BYTES.apk; }); return n; }
function globRe(p) { return new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]') + '$'); }

/* ------------------------------------------------ construction */
/* o : { text, ctxDir, file, tags[], args{}, noCache, target } ; cb(err|null, { image, steps, warnings }) */
NS.buildImage = function (lab, o, cb) {
  const t0 = lab.clock.now; const steps = []; let err = null;
  const cache = lab.buildCache || (lab.buildCache = {});
  const instrs = parseDockerfile(o.text);
  const fail = (msg, extra) => { err = Object.assign({ msg }, extra || {}); finish(); };
  const fmtLines = (hit) => { };
  function finish() { cb(err, { steps, instrs, ms: lab.clock.now - t0, image: err ? null : result }); }
  let result = null;
  if (!instrs.length) return setTimeout0(() => { steps.push({ label: '[internal] load build definition from Dockerfile', ms: 0, subs: ['=> transferring dockerfile: 2B'] }); fail('failed to solve: dockerfile parse error on line 1: file with no instructions', { kind: 'parse' }); });
  for (const ins of instrs) if (!KNOWN.includes(ins.kw)) { return setTimeout0(() => { steps.push({ label: '[internal] load build definition from Dockerfile', ms: 0, subs: ['=> transferring dockerfile: ' + o.text.length + 'B'] }); fail('failed to solve: dockerfile parse error on line ' + ins.line + ': unknown instruction: ' + ins.raw, { kind: 'parse', instr: ins }); }); }
  /* ARG globaux avant le premier FROM */
  const gargs = {}; let k0 = 0; const argVal = (n, d) => o.args && o.args[n] !== undefined ? o.args[n] : d;
  while (k0 < instrs.length && instrs[k0].kw === 'ARG') { const p = instrs[k0].args.split('='); gargs[p[0]] = argVal(p[0], p.length > 1 ? p.slice(1).join('=').replace(/^"(.*)"$/, '$1') : ''); k0++; }
  if (k0 >= instrs.length || instrs[k0].kw !== 'FROM') { return setTimeout0(() => { steps.push({ label: '[internal] load build definition from Dockerfile', ms: 0, subs: ['=> transferring dockerfile: ' + o.text.length + 'B'] }); fail('failed to solve: dockerfile parse error on line ' + (instrs[k0] || instrs[0]).line + ': no build stage in current context', { kind: 'parse', instr: instrs[k0] || instrs[0] }); }); }
  /* découpage en étapes */
  const stages = []; for (let i = k0; i < instrs.length; i++) { if (instrs[i].kw === 'FROM') stages.push({ from: instrs[i], body: [] }); else stages[stages.length - 1].body.push(instrs[i]); }
  let target = stages.length - 1;
  if (o.target) { const ti = stages.findIndex((s, i) => stageName(s, i) === o.target); if (ti < 0) { return setTimeout0(() => fail('failed to solve: target stage "' + o.target + '" could not be found', { kind: 'target' })); } target = ti; }
  function stageName(s, i) { const m = /\s+as\s+(\S+)\s*$/i.exec(s.from.args); return m ? m[1] : (stages.length > 1 ? 'stage-' + i : ''); }
  steps.push({ label: '[internal] load build definition from Dockerfile', ms: 20, subs: ['=> transferring dockerfile: ' + o.text.length + 'B'] });
  const bases = []; stages.forEach((s, i) => { const raw = expand(s.from.args.replace(/^--platform=\S+\s+/, '').replace(/\s+as\s+\S+\s*$/i, ''), gargs).trim(); s.ref = raw; s.isStage = stages.slice(0, i).some((x, j) => stageName(x, j).toLowerCase() === raw.toLowerCase()) ; if (!s.isStage && !bases.includes(raw)) bases.push(raw); });
  const metaSteps = bases.map(b => { const p = lab.parseRef(b); const st = { label: '[internal] load metadata for docker.io/' + (p.repo.includes('/') ? p.repo : 'library/' + p.repo) + ':' + p.tag, ms: 300 + (lab.findImage(b) ? 0 : 200) }; steps.push(st); return st; });
  steps.push({ label: '[internal] load .dockerignore', ms: 10, subs: ['=> transferring context: 2B'] });
  /* .dockerignore */
  let ignore = []; const ctxDir = o.ctxDir; const ig = lab.hostFs.read(ctxDir + '/.dockerignore'); if (ig !== null) { ignore = ig.split('\n').map(x => x.trim()).filter(x => x && x[0] !== '#'); steps[steps.length - 1].subs = ['=> transferring context: ' + ig.length + 'B']; }
  const ignored = rel => ignore.some(p => { p = p.replace(/^\//, '').replace(/\/$/, ''); return rel === p || rel.startsWith(p + '/') || globRe(p).test(rel) || globRe(p).test(rel.split('/')[0]); });
  const finished = []; /* étapes terminées : { name, fs, config, pkgs, layers, hist, img, key } */
  let ctxStep = null; let stageIdx = 0;

  function runStage() {
    if (stageIdx > target) return exportImage();
    const si = stageIdx; const s = stages[si]; const name = stageName(s, si);
    const total = 1 + s.body.filter(b => ['RUN', 'COPY', 'ADD', 'WORKDIR'].includes(b.kw)).length; let n = 0;
    const lab_ = '[' + (name ? name + ' ' : '') + (++n) + '/' + total + '] ';
    const startFrom = (baseState, cachedFlag) => {
      const st = { name, fs: baseState.fs, config: baseState.config, pkgs: baseState.pkgs, layers: baseState.layers, hist: baseState.hist, img: baseState.img, key: baseState.key, args: Object.assign({}, gargs), cmdSet: false };
      steps.push({ label: lab_ + 'FROM ' + (baseState.dispRef), ms: baseState.ms, cached: false, subs: baseState.subs });
      body(st, 0);
    };
    if (s.isStage) { const prev = finished.find(f => f.name && f.name.toLowerCase() === s.ref.toLowerCase()); const bs = { fs: prev.fs.clone(), config: JSON.parse(JSON.stringify(prev.config)), pkgs: Object.assign({}, prev.pkgs), layers: prev.layers.slice(), hist: prev.hist.slice(), img: prev.img, key: prev.key, ms: 0, dispRef: prev.name, subs: null }; return startFrom(bs); }
    const ref = s.ref; const p = lab.parseRef(ref);
    const withImage = img => {
      const bs = { fs: new VFS(VFS.clone(img.fs)), config: JSON.parse(JSON.stringify(img.config)), pkgs: Object.assign({}, img.pkgs || {}), layers: img.layers.slice(), hist: imageHistory(lab, img).slice(), img, key: img.id, ms: 0, dispRef: 'docker.io/' + (p.repo.includes('/') ? p.repo : 'library/' + p.repo) + ':' + p.tag + (img.digest ? '@' + img.digest.slice(0, 19) + '…' : ''), subs: null };
      bs.fs.home = img.os === 'scratch' ? '/' : '/root';
      if (ref === 'scratch') bs.dispRef = 'scratch';
      startFrom(bs);
    };
    if (ref === 'scratch') return withImage({ fs: new VFS(), config: { entrypoint: [], cmd: [], env: [], exposed: [], workdir: '', volumes: [], stopSignal: 'SIGTERM' }, layers: [], id: U.hexOf('scratch', 64), os: 'scratch', spec: NS.registryLookup('hello-world', 'latest'), size: 0, history: [] });
    const local = lab.findImage(ref);
    if (local) { const ms = metaSteps[bases.indexOf(ref)]; return withImage(local); }
    /* pas en local : on tente de le tirer (silencieusement, comme BuildKit) */
    lab.pull(ref, () => { }, (e, r) => {
      if (e) {
        const ms = metaSteps[bases.indexOf(ref)]; ms.err = true; const dispName = 'docker.io/' + (p.repo.includes('/') ? p.repo : 'library/' + p.repo) + ':' + p.tag;
        const real = !NS.REGISTRY[p.repo] ? dispName + ': pull access denied, repository does not exist or may require authorization: server message: insufficient_scope: authorization failed' : dispName + ': not found';
        return fail('failed to solve: ' + (NS.REGISTRY[p.repo] ? ref + ': ' : '') + 'failed to resolve source metadata for ' + dispName + ': ' + real, { kind: 'base', step: ms, instr: s.from });
      }
      withImage(r.image);
    }, { noDefault: true });
  }

  function body(st, bi) {
    const s = stages[stageIdx]; const total = 1 + s.body.filter(b => ['RUN', 'COPY', 'ADD', 'WORKDIR'].includes(b.kw)).length;
    let num = 1 + s.body.slice(0, bi).filter(b => ['RUN', 'COPY', 'ADD', 'WORKDIR'].includes(b.kw)).length;
    if (bi >= s.body.length) { finished.push({ name: stageName(s, stageIdx), fs: st.fs, config: st.config, pkgs: st.pkgs, layers: st.layers, hist: st.hist, img: st.img, key: st.key, st }); stageIdx++; return runStage(); }
    const ins = s.body[bi]; const kw = ins.kw; const nm = stageName(s, stageIdx); const stepNo = ['RUN', 'COPY', 'ADD', 'WORKDIR'].includes(kw) ? '[' + (nm ? nm + ' ' : '') + (num + 1) + '/' + total + '] ' : null;
    const env = Object.assign({}, st.args, envMapOf(st.config.env)); const cfg = st.config;
    const next = () => setTimeout0(() => body(st, bi + 1));
    const hist = (by, size, empty) => st.hist.push({ created: lab.clock.now, by, size: size || 0, empty: !!empty, comment: 'buildkit.dockerfile.v0' });
    const bad = (msg, extra) => { const parse = extra && extra.kind === 'parse'; const stp = { label: (stepNo || '') + ins.text, ms: 0, err: true }; if (!parse) steps.push(stp); fail(msg, Object.assign({ kind: 'instr', step: parse ? null : stp, instr: ins }, extra || {})); };
    /* cache */
    const chainKey = () => U.hexOf(st.key + '|' + ins.text + '|' + Object.keys(st.args).sort().map(k => k + '=' + st.args[k]).join(','), 32);
    const restore = c => { st.fs = new VFS(JSON.parse(c.fs)); st.fs.home = '/root'; st.config = JSON.parse(c.config); st.pkgs = Object.assign({}, c.pkgs); st.layers = c.layers.slice(); st.hist = c.hist.slice(); };
    const save = key => { cache[key] = { fs: JSON.stringify(st.fs.root), config: JSON.stringify(st.config), pkgs: Object.assign({}, st.pkgs), layers: st.layers.slice(), hist: st.hist.slice() }; };
    const stepDone = (stp, key, layer) => { st.key = key; if (layer) st.layers.push(layer); save(key); steps.push(stp); next(); };
    const metaDone = (extra) => { st.key = U.hexOf(st.key + '|' + ins.text + (extra || ''), 32); next(); };
    switch (kw) {
      case 'ARG': { const p = ins.args.split('='); const nmA = p[0].trim(); st.args[nmA] = argVal(nmA, p.length > 1 ? expand(p.slice(1).join('=').replace(/^"(.*)"$/, '$1'), env) : (gargs[nmA] !== undefined ? gargs[nmA] : '')); if (!(o.args && o.args[nmA] !== undefined)) { /* valeur par défaut */ } return metaDone(); }
      case 'ENV': { kvPairs(ins.args).forEach(([k, v]) => setEnv(cfg.env, k, expand(v, env))); hist('ENV ' + kvPairs(ins.args).map(([k, v]) => k + '=' + expand(v, env)).join(' '), 0, true); return metaDone(); }
      case 'LABEL': { cfg.labels = cfg.labels || {}; kvPairs(ins.args).forEach(([k, v]) => { cfg.labels[k] = expand(v, env); }); hist('LABEL ' + ins.args, 0, true); return metaDone(); }
      case 'MAINTAINER': hist('MAINTAINER ' + ins.args, 0, true); return metaDone();
      case 'EXPOSE': { const ex = cfg.exposed = cfg.exposed || []; for (const p of expand(ins.args, env).split(/\s+/).filter(Boolean)) { const m = /^(\d+)(?:-(\d+))?(?:\/(tcp|udp))?$/.exec(p); if (!m) return bad('failed to solve: invalid containerPort: ' + p, { kind: 'parse' }); const e = m[1] + '/' + (m[3] || 'tcp'); if (!ex.includes(e)) ex.push(e); } hist('EXPOSE map[' + expand(ins.args, env).split(/\s+/).filter(Boolean).map(p => (/\//.test(p) ? p : p + '/tcp') + ':{}').join(' ') + ']', 0, true); return metaDone(); }
      case 'USER': cfg.user = expand(ins.args, env); hist('USER ' + cfg.user, 0, true); return metaDone();
      case 'VOLUME': { const arr = jsonArr(ins.args) || ins.args.split(/\s+/); cfg.volumes = cfg.volumes || []; arr.forEach(v => { v = expand(v, env); if (!cfg.volumes.includes(v)) cfg.volumes.push(v); st.fs.mkdirp(v); }); hist('VOLUME ' + goArr(arr).replace(/"/g, ''), 0, true); return metaDone(); }
      case 'STOPSIGNAL': cfg.stopSignal = ins.args; hist('STOPSIGNAL ' + ins.args, 0, true); return metaDone();
      case 'HEALTHCHECK': case 'SHELL': hist(ins.text, 0, true); return metaDone();
      case 'ONBUILD': return bad('failed to solve: ONBUILD n\'est pas pris en charge par Docker Lab', { kind: 'parse' });
      case 'CMD': { const a = jsonArr(ins.args); cfg.cmd = a || ['/bin/sh', '-c', ins.args]; st.cmdSet = true; hist('CMD ' + (a ? goArr(a) : goArr(['/bin/sh', '-c', ins.args])), 0, true); return metaDone(); }
      case 'ENTRYPOINT': { const a = jsonArr(ins.args); cfg.entrypoint = a || ['/bin/sh', '-c', ins.args]; if (!st.cmdSet) cfg.cmd = []; hist('ENTRYPOINT ' + (a ? goArr(a) : goArr(['/bin/sh', '-c', ins.args])), 0, true); return metaDone(); }
      case 'WORKDIR': {
        const key = chainKey(); const w = expand(ins.args, env); const abs = w[0] === '/' ? w : (cfg.workdir || '/').replace(/\/$/, '') + '/' + w;
        const c = !o.noCache && cache[key]; const stp = { label: stepNo + 'WORKDIR ' + w, ms: c ? 0 : 30, cached: !!c };
        if (c) { restore(c); st.key = key; steps.push(stp); return next(); }
        const dir = st.fs.norm('/', abs); st.fs.mkdirp(dir); cfg.workdir = dir; hist('WORKDIR ' + dir, 0, true); st.key = key; save(key); steps.push(stp); return next();
      }
      case 'RUN': {
        const flagsOk = /^--(mount|network|security)/.test(ins.args); if (flagsOk) return bad('failed to solve: les options de RUN (--mount, --network…) ne sont pas simulées', { kind: 'parse' });
        const arr = jsonArr(ins.args); const shell = arr ? arr.map(q).join(' ') : ins.args; const disp = arr ? arr.join(' ') : ins.args; const byCmd = arr ? goArr(arr) : '/bin/sh -c ' + ins.args;
        const key = chainKey(); const c = !o.noCache && cache[key]; const stp = { label: stepNo + 'RUN ' + disp.replace(/\s+/g, ' '), ms: 0, cached: !!c };
        if (c) { restore(c); st.key = key; steps.push(stp); return next(); }
        const cont = new NS.Container(lab, { id: 'buildkit', name: 'buildkit', imageId: st.img.id, imageRef: 'build', spec: st.img.spec, config: { entrypoint: [], cmd: [], env: cfg.env.concat(Object.keys(st.args).map(k => k + '=' + st.args[k])), exposed: [], workdir: cfg.workdir || '/', user: cfg.user || '', tty: false, openStdin: false, hostname: 'buildkitsandbox', imageCmd: [] }, fs: st.fs, pkgs: st.pkgs, nets: { bridge: { aliases: [], ip: '172.17.0.2' } }, runningBuild: true, mounts: [], listen: [], timers: [], procs: [], state: { status: 'running' } });
        const ctx = NS.containerCtx(lab, cont, { workdir: cfg.workdir || '/' }); ctx.inScript = true; const sh = new Shell(lab, ctx);
        const sizeBefore = st.fs.size('/'); const jBefore = JSON.stringify(st.fs.root); const pkBefore = Object.assign({}, st.pkgs); const t1 = lab.clock.now; let outp = '';
        const add = t => { outp += t; };
        sh.run(shell, { out: add, err: add, done: code => {
          stp.ms = Math.max(lab.clock.now - t1, 40);
          if (code !== 0) { stp.err = true; steps.push(stp); return fail('failed to solve: process "' + (arr ? goArr(arr) : '/bin/sh -c ' + ins.args) + '" did not complete successfully: exit code: ' + code, { kind: 'run', step: stp, instr: ins, output: outp, ms: stp.ms }); }
          const changed = JSON.stringify(st.fs.root) !== jBefore || pkgBytes(pkBefore, st.pkgs) > 0; let layer = null; let sz = 0;
          if (changed) { sz = Math.max(0, st.fs.size('/') - sizeBefore) + pkgBytes(pkBefore, st.pkgs); layer = { id: U.hexOf('layer:' + key, 12), size: sz }; }
          hist('RUN ' + byCmd + ' # buildkit', sz, !changed);
          stepDone(stp, key, layer);
        } });
        return;
      }
      case 'COPY': case 'ADD': {
        let rest = ins.args; let from = null; let m;
        while ((m = /^--(\w+)=(\S+)\s*/.exec(rest))) { if (m[1] === 'from') from = m[2]; rest = rest.slice(m[0].length); }
        const arr = jsonArr(rest) || (U.shellSplit(rest) || []).slice(); if (arr.length < 2) return bad('failed to solve: dockerfile parse error on line ' + ins.line + ': ' + kw + ' requires at least two arguments', { kind: 'parse' });
        const srcs = arr.slice(0, -1).map(x => expand(x, env)); let dest = expand(arr[arr.length - 1], env);
        if (kw === 'ADD' && srcs.some(x => /^https?:\/\//.test(x))) return bad('failed to solve: ADD d\'une URL non simulé (le réseau sortant n\'existe pas ici)', { kind: 'parse' });
        let srcFs, srcRoot, fromStage = null;
        if (from !== null) { fromStage = finished.find((f, i) => (f.name && f.name.toLowerCase() === from.toLowerCase()) || String(i) === from); if (!fromStage) return bad('failed to solve: COPY --from=' + from + ' : seules les étapes du Dockerfile sont prises en charge', { kind: 'parse' }); srcFs = fromStage.fs; srcRoot = ''; }
        else { srcFs = lab.hostFs; srcRoot = ctxDir; if (!ctxStep) { ctxStep = { label: '[internal] load build context', ms: 30, subs: [] }; steps.push(ctxStep); } }
        const files = []; let missing = null;
        for (const sp of srcs) {
          const rel = from !== null ? (sp[0] === '/' ? sp : (fromStage.config.workdir || '/') + '/' + sp) : sp.replace(/^\.?\//, '');
          if (from === null && /(^|\/)\.\.(\/|$)/.test(rel)) { missing = { forbidden: sp }; break; }
          const base = from !== null ? srcFs.norm('/', rel) : srcFs.norm('/', srcRoot + '/' + rel);
          const hits = []; if (/[*?]/.test(base)) { const dir = base.slice(0, base.lastIndexOf('/')) || '/'; const re = globRe(base.slice(base.lastIndexOf('/') + 1)); (srcFs.list(dir) || []).filter(x => re.test(x)).forEach(x => hits.push((dir === '/' ? '' : dir) + '/' + x)); } else if (srcFs.exists(base)) hits.push(base);
          if (!hits.length) { missing = { src: sp }; break; }
          hits.forEach(hp => {
            const nodeTop = srcFs.get(hp); const relHp = from !== null ? hp : hp.slice(srcRoot.length).replace(/^\//, '');
            if (from === null && ignored(relHp)) { missing = missing || { src: sp, ign: true }; return; }
            if (nodeTop.t === 'f') files.push({ rel: relHp, path: hp, base: hp.split('/').pop(), data: nodeTop.d, dirSrc: false });
            else { const walk = (n, p, r) => { Object.keys(n.c).forEach(k => { const rr = r ? r + '/' + k : k; if (from === null && ignored((relHp ? relHp + '/' : '') + rr)) return; if (n.c[k].t === 'f') files.push({ rel: rr, data: n.c[k].d, dirSrc: true }); else { files.push({ rel: rr, dir: true, dirSrc: true }); walk(n.c[k], p + '/' + k, rr); } }); }; walk(nodeTop, hp, ''); if (!Object.keys(nodeTop.c).length) files.push({ emptyDirSrc: true }); }
          });
          if (missing && missing.ign) { missing = { src: sp }; break; }
        }
        if (missing) {
          const stp = { label: stepNo + ins.text, ms: 0, err: true }; if (ctxStep) ctxStep.subs = ['=> transferring context: 2B']; steps.push(stp);
          if (missing.forbidden) return fail('failed to solve: failed to compute cache key: forbidden path outside the build context: ' + missing.forbidden + ' ()', { kind: 'instr', step: stp, instr: ins });
          return fail('failed to solve: failed to compute cache key: failed to calculate checksum of ref ' + U.hexOf('ref1' + ins.text, 25) + '::' + U.hexOf('ref2' + ins.text, 25) + ': "/' + missing.src.replace(/^\.?\//, '') + '": not found', { kind: 'instr', step: stp, instr: ins });
        }
        const bytes = files.reduce((a, f) => a + (f.data ? f.data.length : 0), 0);
        if (ctxStep && !ctxStep.done) { ctxStep.subs = ['=> transferring context: ' + (bytes < 1024 ? bytes + 'B' : (bytes / 1024).toFixed(2) + 'kB')]; }
        const sig = files.map(f => f.rel + ':' + (f.data || '')).join('|'); const key = U.hexOf(chainKey() + '|' + U.hexOf(sig, 16), 32);
        const stp = { label: stepNo + kw + (from ? ' --from=' + from : '') + ' ' + (arr.join(' ')), ms: 30, cached: false };
        const c = !o.noCache && cache[key]; if (c) { stp.cached = true; stp.ms = 0; restore(c); st.key = key; steps.push(stp); return next(); }
        const wd = cfg.workdir || '/'; const dabs = st.fs.norm(wd, dest); const dirDest = /\/$/.test(dest) || srcs.length > 1 || files.some(f => f.dirSrc) || files.length > 1 || (st.fs.isDir(dabs));
        const before = st.fs.size('/');
        files.forEach(f => {
          if (f.emptyDirSrc) { st.fs.mkdirp(dabs); return; }
          let tgt; if (f.dirSrc) tgt = dabs + '/' + f.rel; else if (dirDest) tgt = dabs + '/' + f.base; else tgt = dabs;
          if (f.dir) st.fs.mkdirp(tgt); else st.fs.writep(tgt, f.data);
        });
        const sz = bytes + Math.max(0, st.fs.size('/') - before - bytes); const layer = { id: U.hexOf('layer:' + key, 12), size: Math.max(sz, bytes) };
        hist(kw + ' ' + arr.join(' ') + ' # buildkit', layer.size, false);
        return stepDone(stp, key, layer);
      }
      default: return bad('failed to solve: instruction non prise en charge : ' + kw, { kind: 'parse' });
    }
  }

  function exportImage() {
    const st = finished[target]; const cfg = st.config; const key = st.key;
    const id = U.hexOf('built:' + key + '|' + JSON.stringify(cfg), 64);
    let img = lab.images.find(i => i.id === id);
    const baseSize = st.img.size || 0; const baseLayerIds = new Set(st.img.layers.map(l => l.id));
    const size = baseSize + st.layers.filter(l => !baseLayerIds.has(l.id)).reduce((a, l) => a + l.size, 0);
    const exp = { label: 'exporting to image', ms: 100, subs: ['=> exporting layers', '=> writing image sha256:' + id] };
    if (!img) {
      img = { id, refs: [], created: lab.clock.now, size, spec: st.img.spec, config: JSON.parse(JSON.stringify(cfg)), fs: st.fs.root, layers: st.layers.slice(), digest: 'sha256:' + U.hexOf('d' + id, 64), os: st.img.os, history: st.hist.slice(), pkgs: Object.assign({}, st.pkgs), local: true };
      img.config.volumes = img.config.volumes || []; img.config.exposed = img.config.exposed || [];
      lab.images.push(img);
    }
    const names = []; (o.tags || []).forEach(tg => { const p = lab.parseRef(tg); lab.images.forEach(i => { i.refs = i.refs.filter(x => !(x.repo === p.repo && x.tag === p.tag)); }); if (!img.refs.some(x => x.repo === p.repo && x.tag === p.tag)) img.refs.push({ repo: p.repo, tag: p.tag }); names.push('docker.io/' + (p.repo.includes('/') ? p.repo : 'library/' + p.repo) + ':' + p.tag); });
    names.forEach(n => exp.subs.push('=> naming to ' + n));
    steps.push(exp); lab.emit('image', 'build', 'sha256:' + id, { name: names[0] || id.slice(0, 12) });
    result = img;
    lab.wait(150, () => finish());
  }
  setTimeout0(() => lab.wait(60, () => runStage()));
  function setTimeout0(fn) { lab.clock.schedule(0, fn); }
};

/* historique d'une image (pour une image tirée du registre : reconstitué à partir de ses couches) */
function imageHistory(lab, img) {
  if (img.history && img.history.length) return img.history;
  const spec = img.spec; const H = []; const c = img.config; const t = img.created;
  img.layers.forEach((l, i) => H.push({ created: t, by: i === 0 ? '/bin/sh -c #(nop) ADD file:' + U.hexOf('add' + l.id, 64) + ' in / ' : 'RUN /bin/sh -c set -eux; … # buildkit', size: l.size, empty: false, comment: 'buildkit.dockerfile.v0' }));
  if (c.env && c.env.length > 1) H.push({ created: t, by: 'ENV ' + c.env[c.env.length - 1], size: 0, empty: true, comment: 'buildkit.dockerfile.v0' });
  (c.exposed || []).forEach(e => H.push({ created: t, by: 'EXPOSE map[' + e + ':{}]', size: 0, empty: true, comment: 'buildkit.dockerfile.v0' }));
  if (c.entrypoint && c.entrypoint.length) H.push({ created: t, by: 'ENTRYPOINT ' + goArr(c.entrypoint), size: 0, empty: true, comment: 'buildkit.dockerfile.v0' });
  if (c.cmd && c.cmd.length) H.push({ created: t, by: 'CMD ' + goArr(c.cmd), size: 0, empty: true, comment: 'buildkit.dockerfile.v0' });
  img.history = H; return H;
}
NS.imageHistory = imageHistory;

/* ------------------------------------------------ affichage BuildKit (version « terminal » : image finale de la progression) */
const W = 80;
function line(label, t, tag) { const left = ' => ' + (tag ? tag + ' ' : '') + label; const right = t; const room = W - right.length - 1; let l = left.length > room ? left.slice(0, room - 1) + '…' : left; return l.padEnd(room) + ' ' + right; }
function renderTty(res, o, failed) {
  const out = []; const done = res.steps.filter(s => !s.err).length; const total = res.steps.length;
  out.push(('[+] Building ' + hms(res.ms) + ' (' + (failed ? done : total) + '/' + total + ')' + (failed ? '' : ' FINISHED')).padEnd(W - 14) + 'docker:default');
  res.steps.forEach(s => { out.push(line(s.label, s.cached ? '0.0s' : hms(s.ms), s.err ? 'ERROR' : s.cached ? 'CACHED' : '')); (s.subs || []).forEach(x => out.push(' => ' + x.replace(/^=> /, '=> ').padEnd(W - 9) + ' ' + (/exporting layers|writing image|naming|exporting to/.test(x) ? '0.0s' : '0.0s'))); });
  return out.join('\n') + '\n';
}
function renderPlain(res) {
  const out = []; res.steps.forEach((s, i) => { const n = i + 1; out.push('#' + n + ' ' + s.label); (s.subs || []).forEach(x => out.push('#' + n + ' ' + x.replace(/^=> /, '') + ' done')); out.push('#' + n + (s.cached ? ' CACHED' : s.err ? ' ERROR' : ' DONE ' + hms(s.ms))); out.push(''); });
  return out.join('\n') + '\n';
}
function errorBlock(res, err, dockerfileText, file) {
  const out = []; const stp = err.step;
  if (stp) { out.push('------'); out.push(' > ' + stp.label + ':'); (err.output ? err.output.replace(/\n$/, '').split('\n') : []).forEach(l => out.push(((err.ms || 0) / 1000).toFixed(3) + ' ' + l)); out.push('------'); }
  if (err.instr) {
    const L = dockerfileText.replace(/\r/g, '').split('\n'); const a = err.instr.line, b = err.instr.end; out.push(file + ':' + a); out.push('--------------------');
    for (let n = Math.max(1, a - 3); n <= Math.min(L.length, b + 2); n++) { const mk = n >= a && n <= b; out.push(String(n).padStart(4) + ' |' + (mk ? ' >>> ' : '     ') + L[n - 1]); }
    out.push('--------------------');
  }
  out.push('ERROR: ' + err.msg); return out.join('\n') + '\n';
}

/* ------------------------------------------------ docker build */
const BUILD_USAGE = 'ERROR: "docker buildx build" requires exactly 1 argument.\nSee \'docker buildx build --help\'.\n\nUsage:  docker buildx build [OPTIONS] PATH | URL | -\n\nStart a build\n';
SUB.build = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['tag|t:l', 'file|f:s', 'build-arg:l', 'no-cache:b', 'target:s', 'progress:s', 'quiet|q:b', 'pull:b', 'rm:s', 'platform:s', 'label:l', 'network:s', 'load:b', 'compress:b', 'force-rm:b'], false, 'build');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (rest.length !== 1) { st.err(BUILD_USAGE); return st.done(1); }
  why(st, 'docker build', ['docker build lit un fichier nommé Dockerfile et construit une nouvelle image, instruction par instruction.', 'Le dossier donné en argument (souvent « . ») est le « contexte de build » : seuls ses fichiers peuvent être copiés avec COPY.', 'FROM choisit l\'image de départ ; chaque RUN, COPY ou ADD ajoute une couche en lecture seule ; CMD et ENTRYPOINT définissent ce qui démarrera dans un conteneur.', 'Les étapes inchangées sont réutilisées depuis le cache (CACHED) ; dès qu\'une étape change, toutes les suivantes sont refaites : placez donc ce qui change souvent le plus bas possible.', '-t nom:tag donne un nom à l\'image obtenue ; sans -t l\'image reste anonyme (<none>).']);
  const ctxDir = st.ctx.fs.norm(st.ctx.cwd, rest[0]);
  const bad = (m) => { st.err(m + '\n'); st.done(1); };
  if (!lab.hostFs.isDir(ctxDir)) return bad('ERROR: unable to prepare context: path "' + rest[0] + '" not found');
  const dfPath = f.file ? st.ctx.fs.norm(st.ctx.cwd, f.file) : ctxDir + '/Dockerfile'; const dfName = f.file || 'Dockerfile';
  const text = lab.hostFs.read(dfPath);
  if (text === null) return bad('ERROR: failed to solve: failed to read dockerfile: open ' + dfName + ': no such file or directory');
  const bargs = {}; (f['build-arg'] || []).forEach(a => { const i = a.indexOf('='); if (i < 0) bargs[a] = ''; else bargs[a.slice(0, i)] = a.slice(i + 1); });
  for (const tg of (f.tag || [])) if (!lab.validRef(tg)) return bad('ERROR: failed to solve: invalid tag "' + tg + '": invalid reference format');
  const prog = f.progress || 'auto';
  NS.buildImage(lab, { text, ctxDir, tags: f.tag || [], args: bargs, noCache: !!f['no-cache'], target: f.target, file: dfName }, (e, res) => {
    lab.lastBuild = { steps: res.steps, ok: !e, ms: res.ms };
    if (e) {
      if (f.quiet) { st.err(errorBlock(res, e, text, dfName).split('\n').slice(-2).join('\n')); return st.done(1); }
      st.err((prog === 'plain' ? renderPlain(res) : renderTty(res, f, true)) + errorBlock(res, e, text, dfName)); return st.done(1);
    }
    if (f.quiet) { st.out('sha256:' + res.image.id + '\n'); return st.done(0); }
    st.err((prog === 'plain' ? renderPlain(res) : renderTty(res, f, false))); st.done(0);
  });
};
NS.dockerSub.buildx = (a, st) => { if (a[0] === 'build') return SUB.build(a.slice(1), st); st.err('[Docker Lab] seul « docker buildx build » est simulé.\n'); st.done(1); };
NS.dockerImageSub = NS.dockerImageSub || null;

/* ------------------------------------------------ docker history */
SUB.history = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['no-trunc:b', 'quiet|q:b', 'human|H:b', 'format:s'], false, 'history');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (rest.length !== 1) { st.err('docker: "history" requires exactly 1 argument.\nSee \'docker history --help\'.\n\nUsage:  docker history [OPTIONS] IMAGE\n\nShow the history of an image\n'); return st.done(1); }
  const img = lab.findImage(rest[0]); if (!img) { dErr(st, new DockerError('No such image: ' + rest[0])); return st.done(1); }
  why(st, 'docker history', ['Affiche, de la plus récente à la plus ancienne, les instructions qui ont construit l\'image et la taille de chaque couche.', 'Une instruction comme ENV, CMD ou EXPOSE ne pèse rien (0B) ; RUN et COPY ajoutent des couches dont la taille s\'additionne dans l\'image finale.', '« <missing> » signifie que l\'identifiant de cette couche intermédiaire n\'est pas conservé localement : c\'est normal.']);
  const H = imageHistory(lab, img).slice().reverse();
  const rows = [['IMAGE', 'CREATED', 'CREATED BY', 'SIZE', 'COMMENT']].concat(H.map((h, i) => [i === 0 ? img.id.slice(0, 12) : '<missing>', U.humanDuration(lab.clock.now - h.created) + ' ago', f['no-trunc'] ? h.by : (h.by.length > 45 ? h.by.slice(0, 44) + '…' : h.by), U.humanSize(h.size).replace(/^0$/, '0B'), h.comment || '']));
  if (f.quiet) { st.out(H.map((h, i) => (i === 0 ? img.id.slice(0, 12) : '<missing>') + '\n').join('')); return st.done(0); }
  st.out(U.table(rows)); st.done(0);
};
if (NS.dockerImageCmds) NS.dockerImageCmds.history = SUB.history;

/* ------------------------------------------------ docker commit */
SUB.commit = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['author|a:s', 'message|m:s', 'pause|p:s', 'change|c:l'], false, 'commit');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (rest.length < 1 || rest.length > 2) { st.err('docker: "commit" requires at least 1 and at most 2 arguments.\nSee \'docker commit --help\'.\n\nUsage:  docker commit [OPTIONS] CONTAINER [REPOSITORY[:TAG]]\n\nCreate a new image from a container\'s changes\n'); return st.done(1); }
  const c = lab.getContainer(rest[0]); if (!c) { dErr(st, new DockerError('No such container: ' + rest[0])); return st.done(1); }
  why(st, 'docker commit', ['docker commit fige l\'état du système de fichiers d\'un conteneur en une nouvelle image (une couche de plus).', 'C\'est pratique pour expérimenter, mais peu reproductible : personne ne sait ce que vous avez tapé. Un Dockerfile décrit la même chose de façon lisible et rejouable.']);
  const base = lab.images.find(i => i.id === c.imageId); const fsRoot = VFS.clone(c.fs.root);
  const delta = Math.max(0, c.fs.size('/') - new VFS(VFS.clone(base.fs)).size('/')) + pkgBytes(base.pkgs || {}, c.pkgs || {});
  const lay = { id: U.hexOf('commit' + c.id + lab.clock.now, 12), size: delta };
  const id = lab.hex(64); const hist = imageHistory(lab, base).slice(); hist.push({ created: lab.clock.now, by: f.message ? f.message : '', size: delta, empty: false, comment: f.message || '' });
  const img = { id, refs: [], created: lab.clock.now, size: base.size + delta, spec: base.spec, config: JSON.parse(JSON.stringify(base.config)), fs: fsRoot, layers: base.layers.concat([lay]), digest: 'sha256:' + U.hexOf('d' + id, 64), os: base.os, history: hist, pkgs: Object.assign({}, c.pkgs), local: true };
  lab.images.push(img);
  if (rest[1]) { if (!lab.validRef(rest[1])) { st.err('Error response from daemon: invalid reference format\n'); return st.done(1); } const p = lab.parseRef(rest[1]); lab.images.forEach(i => { i.refs = i.refs.filter(x => !(x.repo === p.repo && x.tag === p.tag)); }); img.refs.push({ repo: p.repo, tag: p.tag }); }
  lab.emit('container', 'commit', c.id, { name: c.name }); st.out('sha256:' + id + '\n'); st.done(0);
};
})(typeof window !== 'undefined' ? window : globalThis);
