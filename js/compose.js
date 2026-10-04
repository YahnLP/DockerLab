/* compose.js — `docker compose` : lecture du fichier, projet, up / down / ps / logs / exec / run / build / config… */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const { U, DockerError } = NS; const SUB = NS.dockerSub; const parseFlags = NS.dockerParseFlags; const { dErr, why, eachSeq } = NS.dockerHelpers;
const VERSION = 'v2.29.7';
const FILES = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
const SVC_KEYS = ['image', 'build', 'container_name', 'command', 'entrypoint', 'environment', 'env_file', 'ports', 'expose', 'volumes', 'networks', 'network_mode', 'depends_on', 'restart', 'working_dir', 'user', 'hostname', 'labels', 'healthcheck', 'profiles', 'deploy', 'scale', 'tty', 'stdin_open', 'init', 'stop_grace_period', 'stop_signal', 'platform', 'pull_policy', 'extra_hosts', 'cap_add', 'cap_drop', 'logging', 'dns', 'privileged', 'read_only', 'tmpfs', 'mem_limit', 'cpus', 'links'];
class CErr extends Error { constructor(m) { super(m); } }

/* ------------------------------------------------ interpolation ${VAR} */
function interpolate(s, env, warn) {
  return s.replace(/\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-?])([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, n1, op, arg, n2) => {
    if (m === '$$') return '$'; const n = n1 || n2; const v = env[n]; const set = v !== undefined && v !== '';
    if (op === ':-') return set ? v : arg; if (op === '-') return v !== undefined ? v : arg;
    if (op === ':?') { if (!set) throw new CErr('required variable ' + n + ' is missing a value: ' + arg); return v; }
    if (op === '?') { if (v === undefined) throw new CErr('required variable ' + n + ' is missing a value: ' + arg); return v; }
    if (v === undefined) { warn(n); return ''; } return v;
  });
}
function interpAll(v, env, warn) { if (typeof v === 'string') return interpolate(v, env, warn); if (Array.isArray(v)) return v.map(x => interpAll(x, env, warn)); if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = interpAll(v[k], env, warn); }); return o; } return v; }
function parseEnvFile(text) { const o = {}; (text || '').split('\n').forEach(l => { l = l.trim(); if (!l || l[0] === '#') return; const i = l.indexOf('='); if (i < 0) return; let v = l.slice(i + 1).trim(); if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1); o[l.slice(0, i).trim()] = v; }); return o; }
function dur(s) { if (s === undefined || s === null) return undefined; if (typeof s === 'number') return s * 1000; let t = 0; String(s).replace(/(\d+(?:\.\d+)?)(ms|s|m|h)/g, (m, n, u) => { t += Number(n) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[u]; }); return t; }
const asMap = (v) => { if (!v) return {}; if (Array.isArray(v)) { const o = {}; v.forEach(x => { const s = String(x); const i = s.indexOf('='); if (i < 0) o[s] = null; else o[s.slice(0, i)] = s.slice(i + 1); }); return o; } return v; };

/* ------------------------------------------------ chargement du projet */
function findFile(st, opts) {
  const fs = st.ctx.fs; const files = opts.files || [];
  if (files.length) { const out = files.map(f => fs.norm(st.ctx.cwd, f)); for (let i = 0; i < out.length; i++) if (fs.read(out[i]) === null) throw new CErr('open ' + out[i] + ': no such file or directory'); return out; }
  let d = st.ctx.cwd;
  for (;;) { for (const n of FILES) { const p = (d === '/' ? '' : d) + '/' + n; if (fs.isFile(p)) return [p]; } if (d === '/') break; d = d.replace(/\/[^/]*$/, '') || '/'; }
  return null;
}
function projName(raw) { return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').replace(/^[^a-z0-9]+/, ''); }
function loadProject(st, opts) {
  const lab = st.lab; const fs = st.ctx.fs; const warns = [];
  const paths = findFile(st, opts);
  if (!paths) { if (opts.project) return { name: opts.project, services: {}, order: [], nofile: true, networks: {}, volumes: {}, warns }; throw new CErr('no configuration file provided: not found'); }
  const dir = paths[0].replace(/\/[^/]*$/, '') || '/';
  /* variables : environnement du shell, puis .env (le shell est prioritaire) */
  const envFile = opts.envFile ? fs.norm(st.ctx.cwd, opts.envFile) : dir + '/.env';
  if (opts.envFile && fs.read(envFile) === null) throw new CErr('couldn\'t find env file: ' + envFile);
  const env = Object.assign({}, parseEnvFile(fs.read(envFile)), st.ctx.env || {});
  let doc = {};
  for (const p of paths) {
    let y; try { y = NS.yaml.parse(fs.read(p)); } catch (e) { if (e instanceof NS.yaml.YamlError) throw new CErr(e.message); throw e; }
    if (y === null || typeof y !== 'object' || Array.isArray(y)) { if (y === null) throw new CErr('empty compose file'); throw new CErr('validating ' + p + ': (root) must be a mapping'); }
    const known = ['name', 'services', 'networks', 'volumes', 'version', 'configs', 'secrets', 'include'];
    for (const k of Object.keys(y)) if (!known.includes(k) && !k.startsWith('x-')) throw new CErr('validating ' + p + ': Additional property ' + k + ' is not allowed');
    if ('version' in y) warns.push(p + ': the attribute `version` is obsolete, it will be ignored, please remove it to avoid potential confusion');
    const seen = new Set(); const w = n => { if (!seen.has(n)) { seen.add(n); warns.push('The "' + n + '" variable is not set. Defaulting to a blank string.'); } };
    let yi; try { yi = interpAll(y, env, w); } catch (e) { if (e instanceof CErr) throw e; throw e; }
    ['services', 'networks', 'volumes'].forEach(k => { if (yi[k]) doc[k] = Object.assign(doc[k] || {}, yi[k]); }); if (yi.name) doc.name = yi.name; doc.file = p;
    if (!yi.services || typeof yi.services !== 'object') { if (!doc.services) throw new CErr('validating ' + p + ': services is required'); }
  }
  const name = opts.project ? projName(opts.project) : doc.name ? projName(String(doc.name)) : projName(dir.split('/').pop());
  if (!name) throw new CErr('project name must not be empty');
  const P = { name, dir, files: paths, services: {}, order: [], networks: {}, volumes: {}, warns, env, rawNetworks: doc.networks || {}, rawVolumes: doc.volumes || {} };
  /* réseaux et volumes déclarés */
  Object.keys(P.rawNetworks).forEach(k => { const d = P.rawNetworks[k] || {}; const ext = d.external === true || (d.external && typeof d.external === 'object'); P.networks[k] = { key: k, name: d.name || (ext ? k : name + '_' + k), external: ext, driver: d.driver || 'bridge', internal: !!d.internal }; });
  Object.keys(P.rawVolumes).forEach(k => { const d = P.rawVolumes[k] || {}; const ext = d.external === true || (d.external && typeof d.external === 'object'); P.volumes[k] = { key: k, name: d.name || (ext ? k : name + '_' + k), external: ext }; });
  /* services */
  const S = doc.services || {};
  Object.keys(S).forEach(sn => {
    const raw = S[sn]; if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new CErr('validating ' + doc.file + ': services.' + sn + ' must be a mapping');
    for (const k of Object.keys(raw)) if (!SVC_KEYS.includes(k) && !k.startsWith('x-')) throw new CErr('validating ' + doc.file + ': services.' + sn + ' Additional property ' + k + ' is not allowed');
    if (!raw.image && !raw.build) throw new CErr('service "' + sn + '" has neither an image nor a build context specified: invalid compose project');
    const s = { name: sn, raw };
    s.image = raw.image || null;
    if (raw.build) { const b = typeof raw.build === 'string' ? { context: raw.build } : raw.build; const ctx = st.ctx.fs.norm(dir, b.context || '.'); s.build = { context: ctx, dockerfile: b.dockerfile || 'Dockerfile', args: asMap(b.args), target: b.target || null }; }
    s.imageName = s.image || name + '-' + sn;
    s.container_name = raw.container_name || null;
    const cm = v => v === undefined || v === null ? null : Array.isArray(v) ? v.map(String) : (U.shellSplit(String(v)) || []);
    s.command = cm(raw.command); s.entrypoint = cm(raw.entrypoint);
    const envm = {}; let ef = raw.env_file; if (ef) { (Array.isArray(ef) ? ef : [ef]).forEach(f0 => { const f = typeof f0 === 'object' ? f0.path : f0; const p = st.ctx.fs.norm(dir, f); const t = st.ctx.fs.read(p); if (t === null) { if (typeof f0 === 'object' && f0.required === false) return; throw new CErr('env file ' + p + ' not found: stat ' + p + ': no such file or directory'); } Object.assign(envm, parseEnvFile(t)); }); }
    Object.assign(envm, asMap(raw.environment)); s.environment = envm;
    s.ports = (raw.ports || []).map(p => typeof p === 'object' ? ((p.published ? p.published + ':' : '') + p.target + (p.protocol && p.protocol !== 'tcp' ? '/' + p.protocol : '')) : String(p));
    s.volumes = (raw.volumes || []).map(v => {
      let m; if (typeof v === 'object') m = { type: v.type || 'volume', source: v.source, target: v.target, ro: !!v.read_only }; else { const parts = String(v).split(':'); if (parts.length === 1) m = { type: 'volume', source: null, target: parts[0] }; else m = { source: parts[0], target: parts[1], ro: (parts[2] || '').split(',').includes('ro') }; if (parts.length > 1) m.type = /^[./~]/.test(parts[0]) ? 'bind' : 'volume'; }
      if (m.type === 'bind') m.source = m.source.startsWith('~') ? (st.ctx.env && st.ctx.env.HOME || '/home/student') + m.source.slice(1) : st.ctx.fs.norm(dir, m.source);
      else if (m.source) { const d = P.volumes[m.source]; if (!d) throw new CErr('service "' + sn + '" refers to undefined volume ' + m.source + ': invalid compose project'); m.key = m.source; m.source = d.name; }
      return m;
    });
    s.networkMode = raw.network_mode || null;
    const nets = raw.networks; s.networks = {};
    if (nets) { (Array.isArray(nets) ? nets.map(n => [n, null]) : Object.keys(nets).map(n => [n, nets[n]])).forEach(([n, d]) => { if (!P.networks[n] && n !== 'default') throw new CErr('service "' + sn + '" refers to undefined network ' + n + ': invalid compose project'); s.networks[n] = { aliases: (d && d.aliases) || [] }; }); }
    else if (!s.networkMode) s.networks.default = { aliases: [] };
    const dep = raw.depends_on; s.depends = {}; if (dep) { if (Array.isArray(dep)) dep.forEach(d => { s.depends[d] = 'service_started'; }); else Object.keys(dep).forEach(d => { s.depends[d] = (dep[d] && dep[d].condition) || 'service_started'; }); }
    const rp = String(raw.restart || 'no').split(':'); if (!['no', 'always', 'unless-stopped', 'on-failure'].includes(rp[0])) throw new CErr('validating ' + doc.file + ': services.' + sn + '.restart must be one of "no", "always", "on-failure", "unless-stopped"');
    s.restart = { name: rp[0], max: Number(rp[1] || 0) };
    s.workdir = raw.working_dir || ''; s.user = raw.user ? String(raw.user) : ''; s.hostname = raw.hostname || '';
    s.labels = asMap(raw.labels); s.profiles = raw.profiles || [];
    s.tty = !!raw.tty; s.stdin_open = !!raw.stdin_open; s.stopGrace = raw.stop_grace_period ? dur(raw.stop_grace_period) : 10000;
    s.scale = raw.scale !== undefined ? Number(raw.scale) : (raw.deploy && raw.deploy.replicas !== undefined ? Number(raw.deploy.replicas) : 1);
    const hc = raw.healthcheck; if (hc && !hc.disable) { let t = hc.test; if (typeof t === 'string') t = ['CMD-SHELL', t]; s.health = t && t[0] !== 'NONE' ? { test: t, interval: dur(hc.interval) || 30000, timeout: dur(hc.timeout) || 30000, retries: hc.retries === undefined ? 3 : hc.retries, startPeriod: dur(hc.start_period) || 0 } : null; }
    P.services[sn] = s;
  });
  /* dépendances : existence, cycles, ordre de démarrage */
  Object.values(P.services).forEach(s => Object.keys(s.depends).forEach(d => { if (!P.services[d]) throw new CErr('service "' + s.name + '" depends on undefined service "' + d + '": invalid compose project'); }));
  const state = {}; const order = [];
  const visit = (n, path) => { if (state[n] === 2) return; if (state[n] === 1) { const i = path.indexOf(n); throw new CErr('dependency cycle detected: ' + path.slice(i).concat(n).join(' -> ')); } state[n] = 1; Object.keys(P.services[n].depends).forEach(d => visit(d, path.concat(n))); state[n] = 2; order.push(n); };
  Object.keys(P.services).forEach(n => visit(n, []));
  P.order = order;
  /* réseau par défaut */
  const usesDefault = Object.values(P.services).some(s => s.networks.default);
  if (usesDefault && !P.networks.default) P.networks.default = { key: 'default', name: name + '_default', external: false, driver: 'bridge' };
  /* services demandés (+ profils) */
  P.profiles = opts.profiles || [];
  P.active = n => { const s = P.services[n]; return !s.profiles.length || s.profiles.some(p => P.profiles.includes(p)); };
  return P;
}
/* services visés + leurs dépendances, dans l'ordre */
function selectServices(P, names, withDeps) {
  for (const n of names) if (!P.services[n]) throw new CErr('no such service: ' + n);
  const set = new Set(); const add = n => { if (set.has(n)) return; set.add(n); if (withDeps) Object.keys(P.services[n].depends).forEach(add); };
  if (names.length) names.forEach(add); else P.order.filter(P.active).forEach(add);
  return P.order.filter(n => set.has(n));
}

/* ------------------------------------------------ conteneurs du projet */
const lbl = c => c.config.labels || {};
const projCtrs = (lab, P, oneoff) => lab.containers.filter(c => lbl(c)['com.docker.compose.project'] === P.name && (oneoff || lbl(c)['com.docker.compose.oneoff'] !== 'True'));
const svcCtrs = (lab, P, sn) => projCtrs(lab, P).filter(c => lbl(c)['com.docker.compose.service'] === sn).sort((a, b) => Number(lbl(a)['com.docker.compose.container-number']) - Number(lbl(b)['com.docker.compose.container-number']));
function sortCtrs(P, list) { const idx = n => { const i = P.order ? P.order.indexOf(n) : -1; return i < 0 ? 999 : i; }; return list.slice().sort((a, b) => idx(lbl(a)['com.docker.compose.service']) - idx(lbl(b)['com.docker.compose.service']) || Number(lbl(a)['com.docker.compose.container-number']) - Number(lbl(b)['com.docker.compose.container-number'])); }
const cname = (P, s, n) => s.container_name || P.name + '-' + s.name + '-' + n;
const secs = ms => (ms / 1000).toFixed(1) + 's';
function configHash(P, s, imageId) { return U.hexOf(JSON.stringify([s.image, s.build, s.command, s.entrypoint, s.environment, s.ports, s.volumes, s.networks, s.networkMode, s.restart, s.workdir, s.user, s.hostname, s.labels, s.health, imageId]), 64); }

/* affichage « [+] Running n/n » */
function frame(title, rows, total) {
  if (!rows.length) return '';
  const w = Math.max.apply(null, rows.map(r => r.name.length)), sw = Math.max.apply(null, rows.map(r => r.status.length));
  const ok = rows.filter(r => !r.err).length;
  return '[+] ' + title + ' ' + ok + '/' + (total || rows.length) + '\n' + rows.map(r => ' ' + (r.err ? '✘' : '✔') + ' ' + r.name.padEnd(w) + '  ' + r.status.padEnd(sw) + '  ' + r.t.padStart(5)).join('\n') + '\n';
}
const WHY = {
  up: ['docker compose up lit le fichier compose.yaml et met en place TOUT le projet : réseau(x), volume(s), puis un conteneur par service, dans l\'ordre imposé par depends_on.', 'Les noms sont préfixés par le nom du projet (par défaut : le nom du dossier) : réseau « projet_default », conteneurs « projet-service-1 ».', 'Avec -d, le terminal est rendu ; sans -d, il affiche les journaux de tous les services jusqu\'à Ctrl+C (qui les arrête).', 'Si rien n\'a changé dans la configuration, les conteneurs existants sont conservés (« Running ») ; sinon le service est recréé (« Recreated »).'],
  down: ['docker compose down arrête puis SUPPRIME les conteneurs du projet et les réseaux créés par up.', 'Les volumes nommés sont CONSERVÉS (vos données sont sauves) ; ajoutez -v pour les supprimer aussi.'],
  ps: ['Liste les conteneurs de ce projet seulement (docker ps montrerait tous ceux de l\'hôte). Ajoutez -a pour inclure ceux qui sont arrêtés.'],
  logs: ['Affiche les journaux de tous les services du projet, chaque ligne étant préfixée par le nom du conteneur. Avec -f, suit en direct (Ctrl+C pour quitter).'],
  config: ['Affiche le fichier Compose tel que Docker le comprend : variables ${…} remplacées, valeurs par défaut ajoutées, notations courtes développées. Idéal pour vérifier un fichier avant up.'],
};

/* ------------------------------------------------ images (pull / build) */
function ensureImage(st, P, s, opts, rows, cb) {
  const lab = st.lab; const t0 = lab.clock.now;
  const needBuild = s.build && (opts.build || !lab.findImage(s.imageName));
  if (needBuild && !opts.noBuild) {
    let text = lab.hostFs.read(s.build.context + '/' + s.build.dockerfile);
    if (text === null) return cb(new CErr('failed to solve: failed to read dockerfile: open ' + s.build.dockerfile + ': no such file or directory'));
    const tag = s.imageName.includes(':') ? s.imageName : s.imageName + ':latest';
    return NS.buildImage(lab, { text, ctxDir: s.build.context, tags: [tag], args: s.build.args, noCache: !!opts.noCache, target: s.build.target, file: s.build.dockerfile }, (e, res) => {
      lab.lastBuild = { steps: res.steps, ok: !e, ms: res.ms };
      st.err(NS.buildRender.renderTty(res, {}, !!e) + (e ? NS.buildRender.errorBlock(res, e, text, s.build.dockerfile) : ''));
      if (e) return cb(new CErr('failed to solve: ' + e.msg, true)); rows.push({ name: 'Image ' + s.imageName, status: 'Built', t: secs(lab.clock.now - t0) }); cb(null, lab.findImage(s.imageName));
    });
  }
  const img = lab.findImage(s.imageName); if (img) return cb(null, img);
  if (!s.image) return cb(new CErr('pull access denied for ' + s.imageName + ', repository does not exist or may require \'docker login\''));
  lab.pull(s.image, () => { }, (e, r) => { if (e) return cb(new CErr(e.message)); rows.push({ name: 'Image ' + s.image, status: 'Pulled', t: secs(lab.clock.now - t0) }); cb(null, r.image); }, { noDefault: false });
}

/* ------------------------------------------------ up */
function ensureNets(st, P, rows) {
  const lab = st.lab;
  Object.values(P.networks).forEach(n => {
    if (n.external) { if (!lab.getNetwork(n.name)) throw new CErr('network ' + n.name + ' declared as external, but could not be found'); return; }
    if (lab.getNetwork(n.name)) return;
    if (!Object.values(P.services).some(s => s.networks[n.key])) return;
    lab.createNetwork(n.name, { labels: { 'com.docker.compose.network': n.key, 'com.docker.compose.project': P.name }, internal: n.internal }); rows.push({ name: 'Network ' + n.name, status: 'Created', t: '0.1s' });
  });
  Object.values(P.volumes).forEach(v => {
    if (v.external) { if (!lab.getVolume(v.name)) throw new CErr('external volume "' + v.name + '" not found'); return; }
    if (lab.getVolume(v.name)) return;
    if (!Object.values(P.services).some(s => s.volumes.some(m => m.key === v.key))) return;
    lab.createVolume(v.name, { labels: { 'com.docker.compose.volume': v.key, 'com.docker.compose.project': P.name } }); rows.push({ name: 'Volume ' + v.name, status: 'Created', t: '0.0s' });
  });
}
function createFor(st, P, s, n, img, hash) {
  const lab = st.lab;
  const labels = Object.assign({}, s.labels, { 'com.docker.compose.project': P.name, 'com.docker.compose.service': s.name, 'com.docker.compose.container-number': String(n), 'com.docker.compose.oneoff': 'False', 'com.docker.compose.config-hash': hash, 'com.docker.compose.version': VERSION.slice(1), 'com.docker.compose.project.config_files': P.files.join(','), 'com.docker.compose.project.working_dir': P.dir });
  const names = Object.keys(s.networks).map(k => P.networks[k]).filter(Boolean);
  const o = { image: s.imageName, imageObj: img, name: cname(P, s, n), cmd: s.command || [], env: Object.keys(s.environment).map(k => s.environment[k] === null ? k : k + '=' + s.environment[k]), hostEnv: P.env, tty: s.tty, openStdin: s.stdin_open, workdir: s.workdir, user: s.user, hostname: s.hostname || undefined, ports: s.ports.map(p => lab.parsePort(p)), mounts: s.volumes.map(m => ({ type: m.type, source: m.source, target: m.target, ro: !!m.ro, anonymous: m.type === 'volume' && !m.source })), restart: s.restart, labels, health: s.health, network: s.networkMode || (names[0] ? names[0].name : 'bridge'), aliases: names[0] ? [s.name].concat(s.networks[names[0].key].aliases) : [] };
  if (s.entrypoint) o.entrypoint = s.entrypoint.length ? s.entrypoint : '';
  if (s.entrypoint && !s.entrypoint.length) o.entrypoint = [];
  const c = lab.createContainer(o);
  names.slice(1).forEach(nn => lab.connectNetwork(nn.name, c, [s.name].concat(s.networks[nn.key].aliases)));
  return c;
}
function waitDeps(st, P, s, rows, cb) {
  const lab = st.lab; const deps = Object.keys(s.depends);
  eachSeq(deps, (d, next) => {
    const cond = s.depends[d]; const cs = svcCtrs(lab, P, d); const t0 = lab.clock.now;
    if (cond === 'service_started' || !cs.length) return next();
    let tries = 0;
    const poll = () => {
      for (const c of cs) {
        if (cond === 'service_healthy') {
          if (!c.config.health) return cb(new CErr('dependency failed to start: container ' + c.name + ' has no healthcheck configured'));
          if (!c.running) return cb(new CErr('dependency failed to start: container ' + c.name + ' exited (' + c.state.exitCode + ')'));
          const h = c.state.health && c.state.health.status; if (h === 'unhealthy') return cb(new CErr('dependency failed to start: container ' + c.name + ' is unhealthy'));
          if (h !== 'healthy') { if (++tries > 4000) return cb(new CErr('timeout waiting for ' + c.name)); return lab.wait(500, poll); }
        } else if (cond === 'service_completed_successfully') {
          if (c.running || c.state.status === 'created') { if (++tries > 4000) return cb(new CErr('timeout')); return lab.wait(500, poll); }
          if (c.state.exitCode !== 0) return cb(new CErr('dependency failed to start: container ' + c.name + ' exited (' + c.state.exitCode + ')'));
        }
      }
      cs.forEach(c => { const r = rows.find(x => x.name === 'Container ' + c.name); const lab2 = cond === 'service_healthy' ? 'Healthy' : 'Exited'; if (r) { r.status = lab2; r.t = secs(lab.clock.now - t0 + 100); } });
      next();
    };
    poll();
  }, () => cb(null));
}
function upServices(st, P, names, o, done) {
  const lab = st.lab; const rows = []; const t0 = lab.clock.now; const started = [];
  try { ensureNets(st, P, rows); } catch (e) { return done(e, rows); }
  const sel = selectServices(P, names, true);
  const imgRows = [];
  let failed = null; const bad = new Set();
  eachSeq(sel, (sn, nextSvc) => {
    const s = P.services[sn]; const fail = e => { if (!failed) failed = e; bad.add(sn); };
    if (Object.keys(s.depends).some(d => bad.has(d))) { bad.add(sn); return nextSvc(); }
    ensureImage(st, P, s, o, imgRows, (e, img) => {
      if (e) { fail(e); return nextSvc(); }
      const want = o.scale && o.scale[sn] !== undefined ? o.scale[sn] : s.scale;
      const hash = configHash(P, s, img.id);
      waitDeps(st, P, s, rows, e2 => {
        if (e2) { fail(e2); return nextSvc(); }
        const have = svcCtrs(lab, P, sn); const nums = [];
        for (let i = 1; i <= want; i++) nums.push(i);
        /* surplus à retirer */
        have.filter(c => Number(lbl(c)['com.docker.compose.container-number']) > want).forEach(c => { try { lab.removeContainer(c, { force: true }); } catch (e3) { } rows.push({ name: 'Container ' + c.name, status: 'Removed', t: '0.1s' }); });
        eachSeq(nums, (n, nextN) => {
          const ex = have.find(c => Number(lbl(c)['com.docker.compose.container-number']) === n); const tt = lab.clock.now;
          const row = (status, name) => rows.push({ name: 'Container ' + name, status, t: secs(lab.clock.now - tt) });
          const doStart = (c, status) => { try { lab.start(c); } catch (e4) { rows.push({ name: 'Container ' + c.name, status: 'Error', t: secs(lab.clock.now - tt), err: true }); fail(new DockerError(e4.message)); return nextN(); } lab.wait(250, () => { row(status, c.name); started.push(c); nextN(); }); };
          if (ex && !o.forceRecreate && lbl(ex)['com.docker.compose.config-hash'] === hash) { if (ex.running) { row('Running', ex.name); started.push(ex); return nextN(); } return doStart(ex, 'Started'); }
          const make = (status) => { let c; try { c = createFor(st, P, s, n, img, hash); } catch (e5) { fail(e5); return nextN(); } lab.wait(150, () => doStart(c, status)); };
          if (ex) { return lab.stop(ex, Math.round(s.stopGrace / 1000), () => { try { lab.removeContainer(ex, { force: true }); } catch (e6) { } make('Started'); }); }
          make('Started');
        }, nextSvc);
      });
    });
  }, () => {
    const all = imgRows.concat(rows); const fr = frame('Running', all, all.length);
    done(failed, all, started, fr);
  });
}
function failText(e) { return (e instanceof CErr ? '' : 'Error response from daemon: ') + e.message + '\n'; }
SUB.compose = function (args, st) {
  const lab = st.lab;
  /* options globales : -f, -p, --env-file, --profile, --project-directory */
  const opts = { files: [], profiles: [] }; let i = 0;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === '-f' || a === '--file') opts.files.push(args[++i]); else if (a.startsWith('--file=')) opts.files.push(a.slice(7));
    else if (a === '-p' || a === '--project-name') opts.project = args[++i]; else if (a.startsWith('--project-name=')) opts.project = a.slice(15);
    else if (a === '--env-file') opts.envFile = args[++i]; else if (a === '--profile') opts.profiles.push(args[++i]); else if (a === '--ansi' || a === '--progress' || a === '--project-directory' || a === '--parallel') i++;
    else if (a === '--dry-run' || a === '--compatibility' || a.startsWith('--ansi=') || a.startsWith('--progress=')) { } else break;
  }
  const cmd = args[i]; const rest = args.slice(i + 1);
  if (cmd === '--version' || cmd === 'version') { if (cmd === 'version' && rest.includes('--short')) st.out(VERSION.slice(1) + '\n'); else st.out('Docker Compose version ' + VERSION + '\n'); return st.done(0); }
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') { st.out('\nUsage:  docker compose [OPTIONS] COMMAND\n\nDefine and run multi-container applications with Docker.\n\nOptions:\n  -f, --file stringArray   Compose configuration files\n  -p, --project-name string   Project name\n\nCommands:\n  build       Build or rebuild services\n  config      Parse, resolve and render compose file in canonical format\n  down        Stop and remove containers, networks\n  exec        Execute a command in a running container\n  logs        View output from containers\n  ls          List running compose projects\n  port        Print the public port for a port binding\n  ps          List containers\n  pull        Pull service images\n  restart     Restart service containers\n  rm          Removes stopped service containers\n  run         Run a one-off command on a service\n  start       Start services\n  stop        Stop services\n  up          Create and start containers\n  version     Show the Docker Compose version information\n\nRun \'docker compose COMMAND --help\' for more information on a command.\n'); return st.done(0); }
  const fn = CMD[cmd];
  if (!fn) { st.err('docker: \'compose ' + cmd + '\' is not a docker command.\nSee \'docker --help\'\n'); return st.done(1); }
  if (cmd === 'ls') return fn(rest, st, opts);
  let P; try { P = loadProject(st, opts); } catch (e) { if (!(e instanceof CErr)) throw e; st.err(e.message + '\n'); return st.done(1); }
  P.warns.forEach(w => st.err('WARN[0000] ' + w + '\n'));
  lab.lastWhy = null; WHY[cmd] && (lab.lastWhy = { title: 'docker compose ' + cmd, lines: WHY[cmd] });
  try { fn(rest, st, P, opts); } catch (e) { st.err(failText(e)); st.done(1); }
};
const CMD = {};
CMD.up = function (args, st, P, g) {
  const lab = st.lab;
  const { f, rest, err } = parseFlags(args, ['detach|d:b', 'build:b', 'no-build:b', 'force-recreate:b', 'no-recreate:b', 'remove-orphans:b', 'scale:l', 'no-deps:b', 'abort-on-container-exit:b', 'wait:b', 'pull:s', 'quiet-pull:b', 'timeout|t:s', 'no-color:b', 'attach:l', 'renew-anon-volumes|V:b', 'no-start:b', 'always-recreate-deps:b', 'menu:s', 'watch|w:b', 'yes|y:b', 'exit-code-from:s', 'no-log-prefix:b', 'timestamps:b', 'no-attach:l', 'attach-dependencies:b'], false, 'compose up');
  if (err) { st.err(err + '\n'); return st.done(1); }
  const scale = {}; (f.scale || []).forEach(x => { const [k, v] = x.split('='); scale[k] = Number(v); });
  const o = { build: !!f.build, noBuild: !!f['no-build'], forceRecreate: !!f['force-recreate'], scale };
  upServices(st, P, rest, o, (e, rows, started, fr) => {
    st.out(fr || frame('Running', rows));
    if (e) { st.err(failText(e)); return st.done(1); }
    if (f.detach || f.wait) return st.done(0);
    foreground(st, P, started);
  });
};
function foreground(st, P, ctrs) {
  const lab = st.lab; const list = sortCtrs(P, ctrs); if (!list.length) return st.done(0);
  const w = Math.max.apply(null, list.map(c => c.name.length));
  st.out('Attaching to ' + list.map(c => c.name).join(', ') + '\n');
  let alive = list.length; const subs = [];
  const pre = c => c.name.padEnd(w) + '  | ';
  list.forEach(c => {
    c.logs.forEach(e => st.out(pre(c) + e.text + '\n'));
    const sub = { log: e => st.out(pre(c) + e.text + '\n'), exit: code => { st.out(c.name + ' exited with code ' + code + '\n'); if (--alive <= 0) { st.done(0); } } };
    c.subs.push(sub); subs.push([c, sub]);
  });
  st.onAbort(() => {
    subs.forEach(([c, sub]) => { c.subs = c.subs.filter(x => x !== sub); });
    st.out('\nGracefully stopping... (press Ctrl+C again to force)\n'); const rows = []; const t0 = lab.clock.now;
    eachSeq(list.slice().reverse(), (c, next) => { if (!c.running) return next(); lab.stop(c, 10, () => { rows.push({ name: 'Container ' + c.name, status: 'Stopped', t: secs(lab.clock.now - t0) }); next(); }); }, () => { st.out(frame('Stopping', rows) + 'canceled\n'); st.done(130); });
  });
}
CMD.down = function (args, st, P) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['volumes|v:b', 'rmi:s', 'remove-orphans:b', 'timeout|t:s'], false, 'compose down');
  if (err) { st.err(err + '\n'); return st.done(1); }
  const rows = []; const t0 = lab.clock.now; const cs = sortCtrs(P, projCtrs(lab, P, true)).reverse();
  eachSeq(cs, (c, next) => { const s = P.services[lbl(c)['com.docker.compose.service']]; lab.stop(c, f.timeout ? Number(f.timeout) : s ? Math.round(s.stopGrace / 1000) : 10, () => { try { lab.removeContainer(c, { force: true }); } catch (e) { } rows.push({ name: 'Container ' + c.name, status: 'Removed', t: secs(lab.clock.now - t0) }); next(); }); }, () => {
    if (f.volumes) lab.volumes.filter(v => (v.labels || {})['com.docker.compose.project'] === P.name).forEach(v => { try { lab.removeVolume(v.name); rows.push({ name: 'Volume ' + v.name, status: 'Removed', t: '0.0s' }); } catch (e) { } });
    if (f.rmi) Object.values(P.services).forEach(s => { if (f.rmi === 'local' && s.image) return; const im = lab.findImage(s.imageName); if (im) { try { lab.removeImage(s.imageName, false); rows.push({ name: 'Image ' + s.imageName, status: 'Removed', t: '0.0s' }); } catch (e) { } } });
    lab.networks.filter(n => !n.builtin && (n.labels || {})['com.docker.compose.project'] === P.name).forEach(n => { try { lab.removeNetwork(n.name); rows.push({ name: 'Network ' + n.name, status: 'Removed', t: '0.1s' }); } catch (e) { rows.push({ name: 'Network ' + n.name, status: 'Resource is still in use', t: '0.1s', err: true }); } });
    st.out(frame('Running', rows)); st.done(0);
  });
};
function ctrArg(P, rest, st) { const names = rest.filter(a => a[0] !== '-'); for (const n of names) if (P.services && !P.nofile && !P.services[n]) throw new CErr('no such service: ' + n); return names; }
function pick(st, P, names, all) { const lab = st.lab; let cs = projCtrs(lab, P); if (names.length) cs = cs.filter(c => names.includes(lbl(c)['com.docker.compose.service'])); if (!all) cs = cs.filter(c => c.running); return sortCtrs(P, cs); }
CMD.ps = function (args, st, P) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['all|a:b', 'quiet|q:b', 'services:b', 'format:s', 'filter:l', 'status:l', 'no-trunc:b', 'orphans:b'], false, 'compose ps');
  if (err) { st.err(err + '\n'); return st.done(1); }
  const names = ctrArg(P, rest, st); let cs = pick(st, P, names, !!f.all);
  if (f.status) cs = cs.filter(c => f.status.includes(c.state.status));
  if (f.services) { const set = []; cs.forEach(c => { const s = lbl(c)['com.docker.compose.service']; if (!set.includes(s)) set.push(s); }); st.out(set.join('\n') + (set.length ? '\n' : '')); return st.done(0); }
  if (f.quiet) { st.out(cs.map(c => c.id).join('\n') + (cs.length ? '\n' : '')); return st.done(0); }
  const rows = [['NAME', 'IMAGE', 'COMMAND', 'SERVICE', 'CREATED', 'STATUS', 'PORTS']].concat(cs.map(c => { const cm = c.displayCmd(); return [c.name, c.imageRef.replace(/:latest$/, ''), '"' + (cm.length > 20 ? cm.slice(0, 19) + '…' : cm) + '"', lbl(c)['com.docker.compose.service'], U.humanDuration(lab.clock.now - c.created) + ' ago', lab.statusText(c), lab.portsText(c)]; }));
  st.out(U.table(rows)); st.done(0);
};
CMD.logs = function (args, st, P) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['follow|f:b', 'tail|n:s', 'timestamps|t:b', 'no-color:b', 'no-log-prefix:b', 'since:s', 'until:s', 'index:s'], false, 'compose logs');
  if (err) { st.err(err + '\n'); return st.done(1); }
  const names = ctrArg(P, rest, st); const cs = pick(st, P, names, true);
  const w = Math.max.apply(null, cs.map(c => c.name.length).concat([0]));
  const pre = c => f['no-log-prefix'] ? '' : c.name.padEnd(w) + '  | ';
  const fmt = (c, e) => pre(c) + (f.timestamps ? U.iso(e.t) + ' ' : '') + e.text + '\n';
  let all = []; cs.forEach(c => { let l = c.logs; if (f.tail !== undefined && f.tail !== 'all') l = l.slice(Math.max(0, l.length - Number(f.tail))); l.forEach((e, k) => all.push({ c, e, k })); });
  all.sort((a, b) => a.e.t - b.e.t || cs.indexOf(a.c) - cs.indexOf(b.c) || a.k - b.k);
  st.out(all.map(x => fmt(x.c, x.e)).join(''));
  if (!f.follow) return st.done(0);
  const subs = cs.map(c => { const sub = { log: e => st.out(fmt(c, e)), exit: () => { } }; c.subs.push(sub); return [c, sub]; });
  st.onAbort(() => { subs.forEach(([c, sub]) => { c.subs = c.subs.filter(x => x !== sub); }); st.done(130); });
};
function lifecycle(verb, past, how) {
  return function (args, st, P) {
    const lab = st.lab; const { f, rest, err } = parseFlags(args, ['timeout|t:s', 'signal|s:s', 'wait:b'], false, 'compose ' + verb);
    if (err) { st.err(err + '\n'); return st.done(1); }
    const names = ctrArg(P, rest, st); let cs = pick(st, P, names, true);
    if (verb === 'stop' || verb === 'kill') cs = cs.filter(c => c.running).reverse(); if (verb === 'start') cs = cs.filter(c => !c.running);
    const rows = []; const t0 = lab.clock.now;
    eachSeq(cs, (c, next) => {
      const s = P.services[lbl(c)['com.docker.compose.service']]; const tm = f.timeout ? Number(f.timeout) : s ? Math.round(s.stopGrace / 1000) : 10;
      const fin = () => { rows.push({ name: 'Container ' + c.name, status: past, t: secs(lab.clock.now - t0) }); next(); };
      try { if (how === 'stop') lab.stop(c, tm, fin); else if (how === 'start') { lab.start(c); lab.wait(200, fin); } else if (how === 'restart') lab.restart(c, tm, fin); else { lab.kill(c, f.signal || 'KILL'); lab.wait(100, fin); } } catch (e) { rows.push({ name: 'Container ' + c.name, status: 'Error', t: '0.1s', err: true }); st.err(failText(e)); next(); }
    }, () => { st.out(frame(({ stop: 'Stopping', start: 'Running', restart: 'Restarting', kill: 'Killing' })[verb], rows)); st.done(rows.some(r => r.err) ? 1 : 0); });
  };
}
CMD.stop = lifecycle('stop', 'Stopped', 'stop'); CMD.start = lifecycle('start', 'Started', 'start'); CMD.restart = lifecycle('restart', 'Started', 'restart'); CMD.kill = lifecycle('kill', 'Killed', 'kill');
CMD.rm = function (args, st, P) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['force|f:b', 'stop|s:b', 'volumes|v:b'], false, 'compose rm'); if (err) { st.err(err + '\n'); return st.done(1); }
  const names = ctrArg(P, rest, st); let cs = pick(st, P, names, true); if (!f.stop) cs = cs.filter(c => !c.running);
  if (!cs.length) { st.err('No stopped containers\n'); return st.done(0); }
  const doIt = () => { const rows = []; cs.forEach(c => { try { lab.removeContainer(c, { force: true, volumes: !!f.volumes }); rows.push({ name: 'Container ' + c.name, status: 'Removed', t: '0.1s' }); } catch (e) { } }); st.out(frame('Removing', rows)); st.done(0); };
  if (f.force) return doIt();
  st.ctx.session.ask('Going to remove ' + cs.map(c => c.name).join(', ') + '\nAre you sure? [yN] ', (ans, io) => { if (/^y(es)?$/i.test(ans)) doIt(); else st.done(0); }, { print: t => st.out(t) });
};
CMD.build = function (args, st, P) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['no-cache:b', 'pull:b', 'quiet|q:b', 'build-arg:l', 'progress:s', 'with-dependencies:b'], false, 'compose build'); if (err) { st.err(err + '\n'); return st.done(1); }
  const names = ctrArg(P, rest, st); const sel = (names.length ? names : P.order).filter(n => P.services[n].build);
  if (!sel.length) { st.err('No services to build\n'); return st.done(0); }
  const rows = []; let fail = null;
  eachSeq(sel, (n, next) => { if (fail) return next(); ensureImage(st, P, P.services[n], { build: true, noCache: !!f['no-cache'] }, rows, e => { if (e) fail = e; next(); }); }, () => { if (fail) { st.err(failText(fail)); return st.done(1); } st.out(frame('Building', sel.map(n => ({ name: 'Service ' + n, status: 'Built', t: '0.0s' })))); st.done(0); });
};
CMD.pull = function (args, st, P) {
  const lab = st.lab; const { rest, err } = parseFlags(args, ['quiet|q:b', 'ignore-pull-failures:b', 'include-deps:b'], false, 'compose pull'); if (err) { st.err(err + '\n'); return st.done(1); }
  const names = ctrArg(P, rest, st); const sel = (names.length ? names : P.order).filter(n => P.services[n].image && !P.services[n].build); const rows = []; const t0 = lab.clock.now; let fail = null;
  eachSeq(sel, (n, next) => { lab.pull(P.services[n].image, () => { }, (e) => { if (e) { rows.push({ name: n, status: 'Error', t: secs(lab.clock.now - t0), err: true }); fail = e; } else rows.push({ name: n, status: 'Pulled', t: secs(lab.clock.now - t0) }); next(); }); }, () => { st.out(frame('Pulling', rows)); if (fail) { st.err('Error response from daemon: ' + fail.message + '\n'); return st.done(1); } st.done(0); });
};
CMD.exec = function (args, st, P) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['detach|d:b', 'interactive|i:b', 'tty|t:b', 'no-TTY|T:b', 'env|e:l', 'workdir|w:s', 'user|u:s', 'index:s', 'privileged:b'], true, 'compose exec');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (rest.length < 2) { st.err('"docker compose exec" requires at least 2 arguments.\n'); return st.done(1); }
  const sn = rest[0]; if (!P.services[sn]) throw new CErr('no such service: ' + sn);
  const cs = svcCtrs(lab, P, sn).filter(c => c.running); const idx = f.index ? Number(f.index) : 1; const c = cs.find(x => Number(lbl(x)['com.docker.compose.container-number']) === idx);
  if (!c) { st.err('service "' + sn + '" is not running\n'); return st.done(1); }
  const a = []; if (f.detach) a.push('-d'); a.push('-i', '-t'); if (f['no-TTY']) a.splice(a.indexOf('-t'), 1); (f.env || []).forEach(e => a.push('-e', e)); if (f.workdir) a.push('-w', f.workdir); if (f.user) a.push('-u', f.user);
  SUB.exec(a.concat([c.name], rest.slice(1)), st);
};
CMD.run = function (args, st, P) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['rm:b', 'detach|d:b', 'interactive|i:b', 'tty|t:b', 'no-TTY|T:b', 'name:s', 'env|e:l', 'volume|v:l', 'publish|p:l', 'service-ports|P:b', 'user|u:s', 'workdir|w:s', 'entrypoint:s', 'no-deps:b', 'build:b', 'label|l:l', 'quiet-pull:b'], true, 'compose run');
  if (err) { st.err(err + '\n'); return st.done(1); }
  const sn = rest[0]; if (!sn) { st.err('"docker compose run" requires at least 1 argument.\n'); return st.done(1); }
  const s = P.services[sn]; if (!s) throw new CErr('no such service: ' + sn);
  const deps = f['no-deps'] ? [] : Object.keys(s.depends);
  const go = () => {
    const names = P.order.filter(n => s.depends[n] !== undefined || false);
    ensureImage(st, P, s, { build: !!f.build }, [], (e, img) => {
      if (e) { st.err(failText(e)); return st.done(1); }
      const nets = Object.keys(s.networks).map(k => P.networks[k]).filter(Boolean);
      const a = []; if (f.rm) a.push('--rm'); if (f.detach) a.push('-d'); if (!f['no-TTY'] && !f.detach) a.push('-it');
      a.push('--name', f.name || P.name + '-' + sn + '-run-' + U.hexOf('run' + lab.clock.now + sn, 12));
      if (nets[0]) { a.push('--network', nets[0].name, '--network-alias', sn); }
      Object.keys(s.environment).forEach(k => a.push('-e', s.environment[k] === null ? k : k + '=' + s.environment[k])); (f.env || []).forEach(x => a.push('-e', x));
      s.volumes.forEach(m => a.push('-v', (m.source || '') + (m.source ? ':' : '') + m.target + (m.ro ? ':ro' : ''))); (f.volume || []).forEach(x => a.push('-v', x));
      (f.service_ports ? s.ports : f.publish || []).forEach(p => a.push('-p', p));
      if (s.workdir || f.workdir) a.push('-w', f.workdir || s.workdir); if (s.user || f.user) a.push('-u', f.user || s.user);
      a.push('--label', 'com.docker.compose.project=' + P.name, '--label', 'com.docker.compose.service=' + sn, '--label', 'com.docker.compose.oneoff=True', '--label', 'com.docker.compose.container-number=1');
      const ent = f.entrypoint !== undefined ? f.entrypoint : (s.entrypoint ? s.entrypoint.join(' ') : undefined); if (ent !== undefined) a.push('--entrypoint', ent);
      const cmd = rest.length > 1 ? rest.slice(1) : (s.command || []);
      SUB.run(a.concat([s.imageName], cmd), st);
    });
  };
  if (!deps.length) return go();
  upServices(st, P, deps, {}, (e, rows, started, fr) => { st.out(fr || ''); if (e) { st.err(failText(e)); return st.done(1); } go(); });
};
CMD.port = function (args, st, P) {
  const lab = st.lab; const a = args.filter(x => x[0] !== '-'); if (a.length !== 2) { st.err('"docker compose port" requires exactly 2 arguments.\n'); return st.done(1); }
  const c = svcCtrs(lab, P, a[0]).find(x => x.running); if (!c) { st.err('no container found for ' + a[0] + '\n'); return st.done(1); }
  const b = (c._bound || []).find(x => String(x.port) === a[1].split('/')[0]); if (!b) { st.err('no port ' + a[1] + ' for container ' + c.name + '\n'); return st.done(1); }
  st.out(b.ip + ':' + b.hostPort + '\n'); st.done(0);
};
CMD.ls = function (args, st, g) {
  const lab = st.lab; const { f, err } = parseFlags(args, ['all|a:b', 'quiet|q:b', 'format:s', 'filter:l'], false, 'compose ls'); if (err) { st.err(err + '\n'); return st.done(1); }
  const projs = {}; lab.containers.forEach(c => { const p = lbl(c)['com.docker.compose.project']; if (p) { (projs[p] = projs[p] || []).push(c); } });
  const names = Object.keys(projs).filter(p => f.all || projs[p].some(c => c.running));
  if (f.quiet) { st.out(names.join('\n') + (names.length ? '\n' : '')); return st.done(0); }
  const rows = [['NAME', 'STATUS', 'CONFIG FILES']].concat(names.map(p => { const cs = projs[p]; const run = cs.filter(c => c.running).length; const ex = cs.length - run; const parts = []; if (run) parts.push('running(' + run + ')'); if (ex) parts.push('exited(' + ex + ')'); return [p, parts.join(', '), lbl(cs[0])['com.docker.compose.project.config_files'] || '']; }));
  st.out(U.table(rows)); st.done(0);
};
CMD.config = function (args, st, P) {
  const { f, rest, err } = parseFlags(args, ['quiet|q:b', 'services:b', 'volumes:b', 'networks:b', 'format:s', 'no-interpolate:b', 'output|o:s', 'profiles:b', 'images:b'], false, 'compose config'); if (err) { st.err(err + '\n'); return st.done(1); }
  if (f.quiet) return st.done(0);
  const sel = P.order.filter(P.active);
  if (f.services) { st.out(sel.join('\n') + '\n'); return st.done(0); }
  if (f.volumes) { st.out(Object.keys(P.volumes).join('\n') + (Object.keys(P.volumes).length ? '\n' : '')); return st.done(0); }
  if (f.images) { st.out(sel.map(n => P.services[n].imageName).join('\n') + '\n'); return st.done(0); }
  const out = { name: P.name, services: {} };
  sel.slice().sort().forEach(n => {
    const s = P.services[n]; const o = {};
    if (s.build) o.build = { context: s.build.context, dockerfile: s.build.dockerfile, ...(Object.keys(s.build.args).length ? { args: s.build.args } : {}), ...(s.build.target ? { target: s.build.target } : {}) };
    if (s.command) o.command = s.command; if (s.container_name) o.container_name = s.container_name;
    if (Object.keys(s.depends).length) { o.depends_on = {}; Object.keys(s.depends).forEach(d => { o.depends_on[d] = { condition: s.depends[d], required: true }; }); }
    if (Object.keys(s.environment).length) { o.environment = {}; Object.keys(s.environment).sort().forEach(k => { o.environment[k] = s.environment[k] === null ? null : String(s.environment[k]); }); }
    if (s.entrypoint) o.entrypoint = s.entrypoint;
    if (s.health) o.healthcheck = { test: s.health.test, timeout: secsStr(s.health.timeout), interval: secsStr(s.health.interval), retries: s.health.retries, ...(s.health.startPeriod ? { start_period: secsStr(s.health.startPeriod) } : {}) };
    o.image = s.build && !s.image ? P.name + '-' + n : s.imageName;
    if (s.networkMode) o.network_mode = s.networkMode; else { o.networks = {}; Object.keys(s.networks).forEach(k => { o.networks[k] = s.networks[k].aliases.length ? { aliases: s.networks[k].aliases } : null; }); }
    if (s.ports.length) o.ports = s.ports.map(p => { const lp = NS.Lab.prototype.parsePort.call({}, p); const r = { mode: 'ingress', ...(lp.ip ? { host_ip: lp.ip } : {}), target: lp.port }; if (lp.hostPort) r.published = String(lp.hostPort); r.protocol = lp.proto; return r; });
    if (s.restart.name !== 'no') o.restart = s.restart.name + (s.restart.max ? ':' + s.restart.max : '');
    if (s.volumes.length) o.volumes = s.volumes.map(m => ({ type: m.type, ...(m.source ? { source: m.source } : {}), target: m.target, ...(m.ro ? { read_only: true } : {}), ...(m.type === 'bind' ? { bind: { create_host_path: true } } : { volume: {} }) }));
    if (s.workdir) o.working_dir = s.workdir; if (s.user) o.user = s.user;
    out.services[n] = o;
  });
  const nets = {}; Object.values(P.networks).forEach(n => { nets[n.key] = { name: n.name, ...(n.driver !== 'bridge' ? { driver: n.driver } : {}), ...(n.external ? { external: true } : {}) }; }); if (Object.keys(nets).length) out.networks = nets;
  const vols = {}; Object.values(P.volumes).forEach(v => { vols[v.key] = { name: v.name, ...(v.external ? { external: true } : {}) }; }); if (Object.keys(vols).length) out.volumes = vols;
  st.out(NS.yaml.dump(out)); st.done(0);
};
function secsStr(ms) { if (ms % 60000 === 0 && ms >= 60000) return ms / 60000 + 'm'; if (ms % 1000 === 0) return ms / 1000 + 's'; return ms + 'ms'; }
NS.composeLoad = loadProject;
})(typeof window !== 'undefined' ? window : globalThis);
