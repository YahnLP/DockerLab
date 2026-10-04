/* dockercli.js — commande `docker` (run, ps, exec, logs, images, inspect, volume, network…) et session de terminal de l'hôte */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const { U, DockerError, Shell, CMDS } = NS;
const SUB = {};

/* ------------------------------------------------ analyse des options (style Cobra/pflag) */
/* spec : 'detach|d:b', 'name:s', 'publish|p:l' ; b = booléen, s = chaîne, l = liste */
function mkSpec(list) { const m = {}; list.forEach(e => { const [names, t] = e.split(':'); const ns = names.split('|'); ns.forEach(n => { m[n] = { key: ns[0], t }; }); }); return m; }
function parseFlags(args, specList, stop, cmd) {
  const spec = mkSpec(specList); const f = {}; const rest = []; let err = null; const usage = "See 'docker " + cmd + " --help'.";
  const set = (sp, v) => { if (sp.t === 'l') (f[sp.key] = f[sp.key] || []).push(v); else f[sp.key] = sp.t === 'b' ? true : v; };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') { rest.push.apply(rest, args.slice(i + 1)); break; }
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('='); const nm = eq < 0 ? a.slice(2) : a.slice(2, eq); const sp = spec[nm];
      if (!sp) { err = 'unknown flag: --' + nm + '\n' + usage; break; }
      if (sp.t === 'b') { set(sp, eq < 0 ? true : a.slice(eq + 1) !== 'false'); continue; }
      if (eq >= 0) { set(sp, a.slice(eq + 1)); continue; }
      if (i + 1 >= args.length) { err = 'flag needs an argument: --' + nm + '\n' + usage; break; }
      set(sp, args[++i]); continue;
    }
    if (a[0] === '-' && a.length > 1 && !/^-\d+$/.test(a) || (/^-\d+$/.test(a) && spec[a.slice(1)])) {
      let j = 1; let bad = false;
      while (j < a.length) {
        const ch = a[j]; const sp = spec[ch];
        if (!sp) { err = "unknown shorthand flag: '" + ch + "' in -" + a.slice(j) + '\n' + usage; bad = true; break; }
        if (sp.t === 'b') { set(sp, true); j++; continue; }
        if (j + 1 < a.length) { set(sp, a.slice(j + 1)); } else { if (i + 1 >= args.length) { err = "flag needs an argument: '" + ch + "' in -" + ch + '\n' + usage; bad = true; break; } set(sp, args[++i]); }
        break;
      }
      if (bad) break; continue;
    }
    rest.push(a); if (stop) { rest.push.apply(rest, args.slice(i + 1)); break; }
  }
  return { f, rest, err };
}
const dErr = (st, e) => st.err((e.raw ? '' : 'Error response from daemon: ') + e.message + '\n');
const noCont = ref => new DockerError('No such container: ' + ref);
const FULL = c => c.id;
const why = (st, title, lines) => { st.lab.lastWhy = { title, lines }; };
const flagsTable = {
  run: ['detach|d:b', 'interactive|i:b', 'tty|t:b', 'name:s', 'publish|p:l', 'publish-all|P:b', 'env|e:l', 'env-file:l', 'volume|v:l', 'mount:l', 'network|net:s', 'network-alias:l', 'rm:b', 'restart:s', 'workdir|w:s', 'user|u:s', 'hostname|h:s', 'entrypoint:s', 'label|l:l', 'expose:l', 'privileged:b', 'init:b', 'read-only:b', 'memory|m:s', 'cpus:s', 'dns:l', 'add-host:l', 'pull:s', 'platform:s', 'log-driver:s', 'stop-signal:s', 'stop-timeout:s', 'cap-add:l', 'cap-drop:l', 'security-opt:l', 'shm-size:s', 'ulimit:l', 'link:l', 'device:l', 'tmpfs:l', 'sysctl:l', 'health-cmd:s', 'health-interval:s', 'health-retries:s', 'health-timeout:s', 'no-healthcheck:b', 'group-add:l', 'cpu-shares|c:s', 'memory-swap:s', 'domainname:s', 'ip:s', 'sig-proxy:s', 'detach-keys:s', 'quiet|q:b', 'attach|a:l', 'cidfile:s', 'oom-kill-disable:b', 'pid:s', 'ipc:s', 'uts:s', 'runtime:s', 'gpus:s', 'label-file:l', 'mac-address:s', 'cgroupns:s', 'userns:s'],
};
flagsTable.create = flagsTable.run;

/* ------------------------------------------------ session de terminal de l'hôte */
class HostSession {
  constructor(lab) {
    this.lab = lab; this.history = []; this.stack = []; this.pending = null; this.closed = false; this.masking = false; this.abortFn = null; this.id = ++HostSession.n;
    const ctx = NS.hostCtx(lab); ctx.session = this; this.stack.push({ kind: 'host', ctx, shell: new Shell(lab, ctx) });
    lab.sessions.push(this);
  }
  get top() { return this.stack[this.stack.length - 1]; }
  get depth() { return this.stack.length; }
  get remote() { return !!this.pending || this.top.kind === 'redis'; }
  get ctx() { return this.stack[0].ctx; }
  prompt() { return this.pending ? '' : this.top.ctx ? this.top.ctx.prompt() : this.top.prompt(); }
  /* empile un shell (conteneur ou sous-programme) */
  pushShell(ctxOrShell, o) {
    o = o || {};
    if (ctxOrShell.kind === 'redis') { this.stack.push({ kind: 'redis', ctx: null, prompt: ctxOrShell.prompt, exec: ctxOrShell.exec.bind(ctxOrShell), proc: ctxOrShell, onExit: ctxOrShell.onExit }); return; }
    const ctx = ctxOrShell; ctx.session = this; ctx.pushShell = e => this.pushShell(e); ctx.tty = true;
    this.stack.push({ kind: 'container', ctx, shell: new Shell(this.lab, ctx), onExit: o.onExit, container: o.container });
  }
  popShell(code) { const t = this.stack.pop(); if (t && t.onExit) { try { t.onExit(code === undefined ? 0 : code); } catch (e) { } } }
  ask(text, cb, io) { this.pending = { cb }; io.print(text); }
  abort() { this._rec({ a: 1 }); const t = this.top; if (this.pending) { this.pending = null; } if (t.shell) t.shell.abort(); if (this.abortFn) this.abortFn(); }
  complete(line) {
    const parts = line.split(/\s+/); const last = parts[parts.length - 1]; const lab = this.lab;
    const subs = ['run', 'ps', 'images', 'pull', 'stop', 'start', 'restart', 'kill', 'rm', 'rmi', 'logs', 'exec', 'inspect', 'volume', 'network', 'container', 'image', 'system', 'cp', 'create', 'top', 'stats', 'port', 'rename', 'pause', 'unpause', 'tag', 'version', 'info', 'build', 'compose'];
    let cands = [];
    if (this.top.kind !== 'host') { const fs = this.top.ctx.fs; const d = last.includes('/') ? last.slice(0, last.lastIndexOf('/') + 1) : ''; const names = fs.list(fs.norm(this.top.ctx.cwd, d || '.')) || []; cands = names.map(n => d + n); }
    else if (parts[0] === 'docker') {
      if (parts.length === 2) cands = subs;
      else if (parts.length >= 3) {
        const sub = parts[1] === 'container' || parts[1] === 'image' ? parts[2] : parts[1];
        if (['stop', 'start', 'restart', 'kill', 'rm', 'logs', 'exec', 'inspect', 'top', 'port', 'rename', 'pause', 'unpause', 'stats', 'cp'].includes(sub)) cands = lab.containers.map(c => c.name);
        if (['rmi', 'run', 'pull', 'create', 'tag'].includes(sub)) cands = cands.concat([].concat.apply([], lab.images.map(i => i.refs.map(r => r.repo + ':' + r.tag))), Object.keys(NS.REGISTRY));
        if (sub === 'volume' || sub === 'network') cands = ['create', 'ls', 'rm', 'inspect', 'prune'].concat(sub === 'network' ? ['connect', 'disconnect'] : []).concat(lab.volumes.map(v => v.name), lab.networks.map(n => n.name));
      }
    } else if (parts.length === 1) cands = Object.keys(CMDS).concat(['docker']);
    else { const fs = this.top.ctx.fs; const d = last.includes('/') ? last.slice(0, last.lastIndexOf('/') + 1) : ''; const names = fs.list(fs.norm(this.top.ctx.cwd, d || '.')) || []; cands = names.map(n => d + n); }
    const m = cands.filter(c => c.startsWith(last)).filter((c, i, a) => a.indexOf(c) === i).sort();
    if (!m.length) return line;
    if (m.length === 1) return line.slice(0, line.length - last.length) + m[0] + ' ';
    let pre = m[0]; m.forEach(x => { while (!x.startsWith(pre)) pre = pre.slice(0, -1); });
    if (pre.length > last.length) return line.slice(0, line.length - last.length) + pre;
    return m;
  }
  _rec(e) { const lab = this.lab; if (lab.replaying || !lab.journal) return; e.s = lab.sessions.indexOf(this); e.t = lab.clock.now; lab.journal.push(e); if (lab.journal.length > 5000) lab.journal.shift(); }
  exec(line, io) {
    this._rec({ l: line });
    if (this.history[this.history.length - 1] !== line && line.trim() && !this.pending) this.history.push(line);
    if (this.pending) { const p = this.pending; this.pending = null; p.cb(line.trim(), io); return; }
    const top = this.top;
    if (top.kind === 'redis') { top.exec(line, io); if (top.proc.exited) this.popShell(0); return; }
    const t = line.trim();
    if (t === 'exit' || /^exit \d+$/.test(t)) {
      if (this.stack.length > 1) { const code = /\d+/.test(t) ? Number(t.split(' ')[1]) : top.ctx.code; this.popShell(code); this.lab.changed(); return io.done(); }
      this.closed = true; return io.done();
    }
    const out = t => { if (t.indexOf('\x1b[clear]') >= 0) { io.clear(); t = t.replace(/\x1b\[clear\]\n?/g, ''); } if (t) io.print(t); };
    this.abortFn = null;
    top.shell.run(line, { out, err: out, done: code => { top.ctx.code = code; this.abortFn = null; if (top.ctx.exited && this.stack.length > 1 && this.top === top) { top.ctx.exited = false; this.popShell(top.ctx.exitCode); } io.done(); } });
  }
}
HostSession.n = 0;
NS.HostSession = HostSession;

/* ------------------------------------------------ run / create / exec / start */
function parseVolume(st, s) {
  const parts = s.split(':');
  if (parts.length === 1) return { type: 'volume', anonymous: true, target: parts[0] };
  const opts = (parts[2] || '').split(',');
  const ro = opts.includes('ro');
  if (/^[/]/.test(parts[0])) return { type: 'bind', source: parts[0], target: parts[1], ro };
  if (/^[.~]/.test(parts[0])) return { type: 'volume', source: parts[0], target: parts[1], ro };
  return { type: 'volume', source: parts[0], target: parts[1], ro };
}
function parseMount(s) {
  const o = {}; s.split(',').forEach(kv => { const i = kv.indexOf('='); if (i < 0) o[kv] = true; else o[kv.slice(0, i)] = kv.slice(i + 1); });
  const type = o.type || 'volume'; const target = o.target || o.destination || o.dst;
  return { type, source: o.source || o.src, target, ro: !!(o.readonly || o.ro), anonymous: type === 'volume' && !(o.source || o.src), mountFlag: true };
}
function buildCreate(st, f, rest) {
  const lab = st.lab; const ctx = st.ctx;
  if (!rest.length) return { usage: true };
  const image = rest[0]; const cmd = rest.slice(1);
  const ports = []; (f.publish || []).forEach(p => ports.push(lab.parsePort(p)));
  const env = (f.env || []).slice();
  (f['env-file'] || []).forEach(file => { const d = ctx.fs.read(ctx.fs.norm(ctx.cwd, file)); if (d === null) throw new DockerError('open ' + file + ': no such file or directory', { raw: true, early: true }); d.split('\n').forEach(l => { l = l.trim(); if (l && l[0] !== '#') env.push(l); }); });
  const mounts = (f.volume || []).map(v => parseVolume(st, v)).concat((f.mount || []).map(parseMount));
  const labels = {}; (f.label || []).forEach(l => { const i = l.indexOf('='); labels[i < 0 ? l : l.slice(0, i)] = i < 0 ? '' : l.slice(i + 1); });
  const rp = (f.restart || 'no').split(':'); if (!['no', 'always', 'unless-stopped', 'on-failure'].includes(rp[0])) throw new DockerError('invalid restart policy ' + rp[0] + ': unknown policy \'' + rp[0] + '\'; use one of \'no\', \'always\', \'unless-stopped\', or \'on-failure\'', { raw: true });
  const o = { image, name: f.name, cmd, env, hostEnv: ctx.env, tty: !!f.tty, openStdin: !!f.interactive, workdir: f.workdir, user: f.user, hostname: f.hostname, ports, publishAll: !!f['publish-all'], mounts, network: f.network, aliases: f['network-alias'] || [], restart: { name: rp[0], max: Number(rp[1] || 0) }, autoRemove: !!f.rm, labels };
  if (f.entrypoint !== undefined) o.entrypoint = f.entrypoint === '' ? [] : (U.shellSplit(f.entrypoint) || []);
  if (f.network === 'host' && ports.length) { }
  return { o, image };
}
function usageRun(st, cmd) { st.err('docker: "' + cmd + '" requires at least 1 argument.\nSee \'docker ' + cmd + ' --help\'.\n\nUsage:  docker ' + cmd + ' [OPTIONS] IMAGE [COMMAND] [ARG...]\n\nCreate and run a new container from an image\n'); st.done(125); }
function ensureImage(st, image, quiet, cb) {
  const lab = st.lab; let img = lab.findImage(image);
  lab.lastPulled = false;
  if (img) return cb(null, img, false);
  if (!lab.validRef(image)) return cb(new DockerError('invalid reference format' + (/[A-Z]/.test(image) ? ': repository name (library/' + image.split(':')[0] + ') must be lowercase' : ''), { raw: true }));
  const p = lab.parseRef(image);
  if (!quiet) st.out("Unable to find image '" + p.repo + ':' + p.tag + "' locally\n");
  const ev = { cancel: false }; st.onAbort(() => { ev.cancel = true; st.done(130); });
  lab.pull(image, quiet ? () => { } : t => { if (!ev.cancel) st.out(t); }, (err, r) => { if (ev.cancel) return; lab.lastPulled = true; cb(err, r && r.image, true); }, { noDefault: true });
}
function runErr(st, e, cmd) {
  const msg = e.raw ? e.message : 'Error response from daemon: ' + e.message;
  st.err('docker: ' + msg + (/\.$/.test(msg) ? '' : '.') + '\nSee \'docker ' + cmd + ' --help\'.\n');
  st.done(/executable file not found/.test(e.message) ? 127 : /no such file or directory/.test(e.message) && e.code === 'oci' ? 126 : 125);
}
SUB.run = function (args, st, cmd) {
  cmd = cmd || 'run'; const lab = st.lab;
  const { f, rest, err } = parseFlags(args, flagsTable.run, true, cmd);
  if (err) { st.err(err + '\n'); return st.done(125); }
  let b; try { b = buildCreate(st, f, rest); } catch (e) { return runErr(st, e, cmd); }
  if (b.usage) return usageRun(st, cmd);
  ensureImage(st, b.image, false, (e, img) => {
    if (e) return runErr(st, e, cmd);
    b.o.imageObj = img; let c;
    try { c = lab.createContainer(b.o); } catch (e2) { return runErr(st, e2, cmd); }
    if (cmd === 'create') { st.out(c.id + '\n'); why(st, 'docker create', ['Docker a créé le conteneur ' + c.name + ' à partir de l\'image ' + b.image + ' mais ne l\'a pas démarré (état « Created »).', 'Démarrez-le avec : docker start ' + c.name]); return st.done(0); }
    if (f.detach) {
      try { lab.start(c); } catch (e3) { if (c.host.autoRemove) lab.removeContainer(c, { force: true, volumes: true }); return runErr(st, e3, cmd); }
      st.out(c.id + '\n'); explainRun(st, c, b, true); return st.done(0);
    }
    attachRun(st, c, f, b, cmd);
  });
};
function explainRun(st, c, b, det) {
  const l = ['1. Le client Docker contacte le démon Docker.', '2. Image « ' + b.image + ' » : ' + (st.lab.lastPulled ? 'absente en local, téléchargée depuis le registre (Docker Hub).' : 'trouvée en local (rien à télécharger).'), '3. Création du conteneur « ' + c.name + ' » à partir de l\'image (couche en lecture/écriture ajoutée).', '4. Connexion au réseau « ' + c.host.network + ' »' + (c.primaryIp() ? ' (IP ' + c.primaryIp() + ')' : '') + '.'];
  if (c.host.ports.length) l.push('5. Publication des ports : ' + c.host.ports.map(p => (p.ip || '0.0.0.0') + ':' + p.hostPort + ' (hôte) → ' + p.port + ' (conteneur)').join(', ') + '.');
  if (c.mounts.length) l.push('6. Montages : ' + c.mounts.map(m => (m.type === 'volume' ? 'volume ' + m.name : 'dossier ' + m.source) + ' → ' + m.destination).join(', ') + '.');
  l.push((det ? '7. Option -d : le conteneur tourne en arrière-plan ; Docker affiche seulement son identifiant (64 caractères).' : '7. Sans -d : le terminal reste attaché à la sortie du conteneur.'));
  st.lab.lastWhy = { title: 'docker run', lines: l };
}
function attachRun(st, c, f, b, cmd) {
  const lab = st.lab; const session = st.ctx.session; let done = false;
  const interactive = !!(f.tty && f.interactive);
  const sub = { log: e => st.out(e.text + '\n'), exit: code => { finish(code); } };
  const finish = code => { if (done) return; done = true; c.subs = c.subs.filter(s => s !== sub); st.done(code); };
  c.subs.push(sub);
  st.onAbort(() => { if (c.running) { try { lab.kill(c, 'INT'); } catch (e) { } } });
  try { lab.start(c); } catch (e) { c.subs = c.subs.filter(s => s !== sub); if (c.host.autoRemove) lab.removeContainer(c, { force: true, volumes: true }); return runErr(st, e, cmd); }
  explainRun(st, c, b, false);
  if (done) return;
  if (interactive && c.proc && c.proc.type === 'shell' && session) {
    c.subs = c.subs.filter(s => s !== sub); done = true;
    const ctx = NS.containerCtx(lab, c, { tty: true, shname: (c.effective()[0] || '').split('/').pop() });
    session.pushShell(ctx, { container: c, onExit: code => { if (c.running) { c.manualStop = true; lab._exit(c, code); } } });
    return st.done(0);
  }
}
SUB.create = (args, st) => SUB.run(args, st, 'create');
SUB.start = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['attach|a:b', 'interactive|i:b'], false, 'start');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (!rest.length) { st.err('docker: "start" requires at least 1 argument.\nSee \'docker start --help\'.\n\nUsage:  docker start [OPTIONS] CONTAINER [CONTAINER...]\n\nStart one or more stopped containers\n'); return st.done(1); }
  const failed = []; let code = 0;
  rest.forEach(ref => {
    let c; try { c = lab.getContainer(ref); if (!c) throw noCont(ref); } catch (e) { dErr(st, e); failed.push(ref); return; }
    try { c.state.restarting = false; c.restartTok = (c.restartTok || 0) + 1; lab.start(c); st.out(ref + '\n'); } catch (e) { dErr(st, e); failed.push(ref); }
  });
  why(st, 'docker start', ['Docker redémarre un conteneur déjà créé : même identifiant, même configuration, mêmes volumes. Seul le processus principal est relancé.']);
  if (failed.length) { st.err('Error: failed to start containers: ' + failed.join(', ') + '\n'); code = 1; }
  if (f.attach && rest.length === 1 && !failed.length) { const c = lab.getContainer(rest[0]); const sub = { log: e => st.out(e.text + '\n'), exit: cd => { c.subs = c.subs.filter(s => s !== sub); st.done(cd); } }; if (!c.running) return st.done(c.state.exitCode); c.logs.forEach(e => st.out(e.text + '\n')); c.subs.push(sub); st.onAbort(() => { try { lab.kill(c, 'INT'); } catch (e) { } }); return; }
  st.done(code);
};
function eachSeq(list, fn, end) { let i = 0; const next = () => { if (i >= list.length) return end(); fn(list[i++], next); }; next(); }
SUB.stop = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['time|t:s', 'signal|s:s'], false, 'stop');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (!rest.length) { st.err('docker: "stop" requires at least 1 argument.\nSee \'docker stop --help\'.\n\nUsage:  docker stop [OPTIONS] CONTAINER [CONTAINER...]\n\nStop one or more running containers\n'); return st.done(1); }
  let code = 0; const tm = f.time !== undefined ? Number(f.time) : undefined;
  why(st, 'docker stop', ['Docker envoie le signal SIGTERM au processus principal (PID 1) du conteneur et attend (10 s par défaut).', 'Si le processus ne s\'arrête pas dans ce délai, Docker envoie SIGKILL (code de sortie 137).', 'nginx, redis, postgres… gèrent SIGTERM et s\'arrêtent proprement (code 0). Un simple « sleep » lancé en PID 1 l\'ignore : il faut attendre les 10 secondes.']);
  eachSeq(rest, (ref, next) => { let c; try { c = lab.getContainer(ref); if (!c) throw noCont(ref); } catch (e) { dErr(st, e); code = 1; return next(); } lab.stop(c, tm, () => { st.out(ref + '\n'); next(); }); }, () => st.done(code));
};
SUB.restart = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['time|t:s', 'signal|s:s'], false, 'restart');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (!rest.length) { st.err('docker: "restart" requires at least 1 argument.\nSee \'docker restart --help\'.\n'); return st.done(1); }
  let code = 0; const tm = f.time !== undefined ? Number(f.time) : undefined;
  eachSeq(rest, (ref, next) => { let c; try { c = lab.getContainer(ref); if (!c) throw noCont(ref); } catch (e) { dErr(st, e); code = 1; return next(); } lab.restart(c, tm, e => { if (e) { dErr(st, e); code = 1; } else st.out(ref + '\n'); next(); }); }, () => st.done(code));
};
SUB.kill = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['signal|s:s'], false, 'kill');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (!rest.length) { st.err('docker: "kill" requires at least 1 argument.\nSee \'docker kill --help\'.\n'); return st.done(1); }
  let code = 0; rest.forEach(ref => { try { const c = lab.getContainer(ref); if (!c) throw noCont(ref); lab.kill(c, f.signal); st.out(ref + '\n'); } catch (e) { dErr(st, e); code = 1; } });
  st.done(code);
};
SUB.rm = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['force|f:b', 'volumes|v:b', 'link|l:b'], false, 'rm');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (!rest.length) { st.err('docker: "rm" requires at least 1 argument.\nSee \'docker rm --help\'.\n\nUsage:  docker rm [OPTIONS] CONTAINER [CONTAINER...]\n\nRemove one or more containers\n'); return st.done(1); }
  let code = 0;
  why(st, 'docker rm', ['Docker supprime le conteneur (sa couche en écriture et ses journaux). L\'image n\'est pas touchée.', 'Un conteneur en cours d\'exécution refuse la suppression : arrêtez-le d\'abord (docker stop) ou forcez avec -f.', 'Les volumes nommés sont conservés ; les volumes anonymes ne sont supprimés qu\'avec -v.']);
  const run = (ref, next) => {
    let c; try { c = lab.getContainer(ref); if (!c) { if (f.force) return next(); throw noCont(ref); } lab.removeContainer(c, { force: !!f.force, volumes: !!f.volumes }); st.out(ref + '\n'); } catch (e) { dErr(st, e); code = 1; } next();
  };
  eachSeq(rest, run, () => st.done(code));
};
function ctrRows(st, list, noTrunc) {
  const lab = st.lab;
  return list.map(c => ({ ID: noTrunc ? c.id : c.shortId, Image: c.imageRef, Command: '"' + (noTrunc ? c.displayCmd() : (c.displayCmd().length > 20 ? c.displayCmd().slice(0, 19) + '…' : c.displayCmd())) + '"', CreatedAt: U.isoShort(lab.epoch + c.created), RunningFor: U.humanDuration(lab.clock.now - c.created) + ' ago', Ports: lab.portsText(c), Status: lab.statusText(c), Names: c.name, State: c.state.status, Networks: lab.netStatus(c), Mounts: c.mounts.map(m => m.type === 'volume' ? m.name : m.source).join(','), Labels: Object.keys(c.config.labels).map(k => k + '=' + c.config.labels[k]).join(','), Size: '0B (virtual ' + U.humanSize(((lab.images.find(i => i.id === c.imageId) || {}).size) || 0) + ')', c }));
}
const HDR = { ID: 'CONTAINER ID', Image: 'IMAGE', Command: 'COMMAND', CreatedAt: 'CREATED AT', RunningFor: 'CREATED', Ports: 'PORTS', Status: 'STATUS', Names: 'NAMES', State: 'STATE', Networks: 'NETWORKS', Mounts: 'MOUNTS', Labels: 'LABELS', Size: 'SIZE', Repository: 'REPOSITORY', Tag: 'TAG', CreatedSince: 'CREATED', Digest: 'DIGEST', Driver: 'DRIVER', Name: 'VOLUME NAME', Scope: 'SCOPE', Internal: 'INTERNAL' };
function fmtList(st, rows, f, defCols, id) {
  const fmt = f.format;
  if (f.quiet) { return rows.map(r => r[id]).join('\n') + (rows.length ? '\n' : ''); }
  if (fmt) {
    if (/^table/.test(fmt)) { const tpl = fmt.replace(/^table\s*/, ''); const cols = tpl.split(/\\t|\t/); const hdr = cols.map(c => { const m = /\{\{\s*\.(\w+)\s*\}\}/.exec(c); return m ? (HDR[m[1]] || m[1]).toUpperCase() : c; }); return U.table([hdr].concat(rows.map(r => cols.map(c => U.goTemplate(c, r))))); }
    return rows.map(r => U.goTemplate(fmt, r)).join('\n') + (rows.length ? '\n' : '');
  }
  return U.table([defCols.map(c => c.h || HDR[c.k])].concat(rows.map(r => defCols.map(c => r[c.k]))));
}
function matchFilter(st, c, flt) {
  return flt.every(x => { const i = x.indexOf('='); const k = i < 0 ? x : x.slice(0, i), v = i < 0 ? '' : x.slice(i + 1);
    if (k === 'name') return new RegExp(v).test(c.name); if (k === 'id') return c.id.startsWith(v); if (k === 'status') return c.state.status === v || (v === 'running' && c.state.status === 'running'); if (k === 'ancestor') { const im = st.lab.findImage(v); return !!im && im.id === c.imageId; } if (k === 'label') { const j = v.indexOf('='); return j < 0 ? v in c.config.labels : c.config.labels[v.slice(0, j)] === v.slice(j + 1); } if (k === 'network') return c.netList().includes(v); if (k === 'volume') return c.mounts.some(m => m.name === v || m.destination === v); if (k === 'exited') return c.state.status === 'exited' && String(c.state.exitCode) === v; if (k === 'publish' || k === 'expose') return (c.config.exposed || []).some(e => e.startsWith(v)); return true; });
}
SUB.ps = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['all|a:b', 'quiet|q:b', 'latest|l:b', 'last|n:s', 'no-trunc:b', 'filter|f:l', 'format:s', 'size|s:b'], false, 'ps');
  if (err) { st.err(err + '\n'); return st.done(1); }
  let list = lab.containers.slice().reverse();
  if (!f.all && !f.latest && !f.last) list = list.filter(c => c.state.status === 'running' || c.state.status === 'paused' || c.state.status === 'restarting');
  if (f.filter) list = list.filter(c => matchFilter(st, c, f.filter));
  if (f.latest) list = list.slice(0, 1); if (f.last && Number(f.last) >= 0) list = list.slice(0, Number(f.last));
  const rows = ctrRows(st, list, f['no-trunc']);
  why(st, 'docker ps', ['docker ps liste les conteneurs EN COURS d\'exécution. Avec -a (all), il affiche aussi ceux qui sont arrêtés (Exited) ou seulement créés (Created).', 'PORTS : « 0.0.0.0:8080->80/tcp » signifie que le port 8080 de l\'hôte est redirigé vers le port 80 du conteneur.', 'NAMES : le nom du conteneur (choisi avec --name, sinon généré au hasard).']);
  st.out(fmtList(st, rows, { format: f.format, quiet: f.quiet }, [{ k: 'ID' }, { k: 'Image' }, { k: 'Command' }, { k: 'RunningFor' }, { k: 'Status' }, { k: 'Ports' }, { k: 'Names' }], 'ID'));
  st.done(0);
};
function imgRows(lab, noTrunc) {
  const rows = [];
  lab.images.slice().sort((a, b) => b.created - a.created).forEach(i => { const refs = i.refs.length ? i.refs : [{ repo: '<none>', tag: '<none>' }]; refs.forEach(r => rows.push({ Repository: r.repo, Tag: r.tag, ID: noTrunc ? 'sha256:' + i.id : i.id.slice(0, 12), CreatedSince: U.humanDuration(lab.clock.now - i.created) + ' ago', CreatedAt: U.isoShort(lab.epoch + i.created), Size: U.humanSize(i.size), Digest: i.digest, i })); });
  return rows;
}
SUB.images = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['all|a:b', 'quiet|q:b', 'no-trunc:b', 'filter|f:l', 'format:s', 'digests:b'], false, 'images');
  if (err) { st.err(err + '\n'); return st.done(1); }
  let rows = imgRows(lab, f['no-trunc']);
  if (rest.length) { const p = lab.parseRef(rest[0]); rows = rows.filter(r => r.Repository === p.repo && (!/:/.test(rest[0]) || r.Tag === p.tag)); }
  (f.filter || []).forEach(x => { const [k, v] = x.split('='); if (k === 'reference') rows = rows.filter(r => new RegExp('^' + v.replace(/\*/g, '.*') + '$').test(r.Repository + ':' + r.Tag) || new RegExp('^' + v.replace(/\*/g, '.*') + '$').test(r.Repository)); if (k === 'dangling') rows = rows.filter(r => (r.Repository === '<none>') === (v === 'true')); });
  why(st, 'docker images', ['Liste les images stockées localement (téléchargées avec docker pull ou construites avec docker build).', 'Une même image (même IMAGE ID) peut avoir plusieurs tags : nginx:latest et nginx:1.27 par exemple.']);
  st.out(fmtList(st, rows, { format: f.format, quiet: f.quiet }, [{ k: 'Repository' }, { k: 'Tag' }, { k: 'ID', h: 'IMAGE ID' }, { k: 'CreatedSince' }, { k: 'Size' }], 'ID')); st.done(0);
};
SUB.pull = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['quiet|q:b', 'all-tags|a:b', 'platform:s', 'disable-content-trust:s'], false, 'pull');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (!rest.length) { st.err('docker: "pull" requires 1 argument.\nSee \'docker pull --help\'.\n\nUsage:  docker pull [OPTIONS] NAME[:TAG|@DIGEST]\n\nDownload an image from a registry\n'); return st.done(1); }
  const ev = { c: false }; st.onAbort(() => { ev.c = true; st.done(130); });
  why(st, 'docker pull', ['Docker contacte le registre (Docker Hub), récupère la liste des couches (layers) de l\'image et ne télécharge que celles qu\'il n\'a pas déjà (« Already exists »).', 'Sans tag, Docker prend « latest » (tag par défaut).', 'L\'image est ensuite disponible en local : docker images.']);
  const lines = [];
  lab.pull(rest[0], t => { if (ev.c) return; if (f.quiet) lines.push(t); else st.out(t); }, (e, r) => { if (ev.c) return; if (e) { dErr(st, e); return st.done(1); } if (f.quiet) st.out(lines[lines.length - 1]); st.done(0); });
};
SUB.logs = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['follow|f:b', 'tail|n:s', 'timestamps|t:b', 'since:s', 'until:s', 'details:b'], false, 'logs');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (rest.length !== 1) { st.err('docker: "logs" requires exactly 1 argument.\nSee \'docker logs --help\'.\n\nUsage:  docker logs [OPTIONS] CONTAINER\n\nFetch the logs of a container\n'); return st.done(1); }
  let c; try { c = lab.getContainer(rest[0]); if (!c) throw noCont(rest[0]); } catch (e) { dErr(st, e); return st.done(1); }
  why(st, 'docker logs', ['Affiche ce que le processus principal du conteneur a écrit sur sa sortie standard et d\'erreur (stdout/stderr).', 'Avec -f (follow), le terminal reste connecté et affiche les nouvelles lignes ; Ctrl+C pour quitter.', 'Avec --tail N, seules les N dernières lignes sont affichées. C\'est le premier réflexe quand un conteneur s\'arrête tout seul.']);
  let ls = c.logs; if (f.tail !== undefined && f.tail !== 'all') ls = ls.slice(Math.max(0, ls.length - Number(f.tail)));
  const fmt = e => (f.timestamps ? U.iso(e.t) + ' ' : '') + e.text + '\n';
  st.out(ls.map(fmt).join(''));
  if (!f.follow) return st.done(0);
  const sub = { log: e => st.out(fmt(e)), exit: () => { } }; c.subs.push(sub);
  st.onAbort(() => { c.subs = c.subs.filter(s => s !== sub); st.done(130); });
};
SUB.exec = function (args, st) {
  const lab = st.lab; const session = st.ctx.session;
  const { f, rest, err } = parseFlags(args, ['detach|d:b', 'interactive|i:b', 'tty|t:b', 'env|e:l', 'workdir|w:s', 'user|u:s', 'privileged:b', 'detach-keys:s'], true, 'exec');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (rest.length < 2) { st.err('docker: "exec" requires at least 2 arguments.\nSee \'docker exec --help\'.\n\nUsage:  docker exec [OPTIONS] CONTAINER COMMAND [ARG...]\n\nExecute a command in a running container\n'); return st.done(1); }
  let c; try { c = lab.getContainer(rest[0]); if (!c) throw noCont(rest[0]); } catch (e) { dErr(st, e); return st.done(1); }
  if (c.state.status === 'paused') { st.err('Error response from daemon: Container ' + c.id + ' is paused, unpause the container before exec\n'); return st.done(1); }
  if (!c.running) { st.err('Error response from daemon: container ' + c.id + ' is not running\n'); return st.done(1); }
  const argv = rest.slice(1); const ctx = NS.containerCtx(lab, c, { tty: !!f.tty, workdir: f.workdir, user: f.user, env: f.env || [], shname: argv[0].split('/').pop() });
  why(st, 'docker exec', ['docker exec lance un NOUVEAU processus dans un conteneur déjà en cours d\'exécution (le processus principal n\'est pas touché).', 'Avec -it : terminal interactif (ex. docker exec -it web sh). « exit » quitte le shell sans arrêter le conteneur.', 'Sans -it : la commande s\'exécute, affiche son résultat et rend la main.']);
  const name = argv[0].split('/').pop();
  const bad = NS.shellCanRun(lab, c, argv);
  if (bad) { st.err('OCI runtime exec failed: exec failed: unable to start container process: exec: "' + argv[0] + '": ' + bad + ': unknown\n'); return st.done(126); }
  if (f.detach) { const sh = new Shell(lab, ctx); sh.run(argv.map(q).join(' '), { out: () => { }, err: () => { }, done: () => { } }); return st.done(0); }
  if (['sh', 'bash', 'ash'].includes(name) && argv.indexOf('-c') < 0 && argv.length === 1) {
    if (f.tty && f.interactive && session) { session.pushShell(ctx, { container: c, onExit: () => { } }); return st.done(0); }
    return st.done(0);
  }
  if (f.tty && session) ctx.pushShell = e => session.pushShell(e);
  const sh = new Shell(lab, ctx); st.onAbort(() => sh.abort());
  sh.run(argv.map(q).join(' '), { out: st.out, err: st.err, done: code => st.done(code) });
};
const q = a => "'" + String(a).replace(/'/g, "'\\''") + "'";
SUB.inspect = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['format|f:s', 'type:s', 'size|s:b'], false, 'inspect');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (!rest.length) { st.err('docker: "inspect" requires at least 1 argument.\nSee \'docker inspect --help\'.\n\nUsage:  docker inspect [OPTIONS] NAME|ID [NAME|ID...]\n\nReturn low-level information on Docker objects\n'); return st.done(1); }
  const objs = []; let code = 0; const errs = [];
  rest.forEach(ref => {
    let o = null; const t = f.type;
    if (!t || t === 'container') { const c = lab.getContainer(ref); if (c) o = lab.inspectContainer(c); }
    if (!o && (!t || t === 'image')) { const i = lab.findImage(ref); if (i) o = lab.inspectImage(i); }
    if (!o && (!t || t === 'network')) { const n = lab.getNetwork(ref); if (n) o = lab.inspectNetwork(n); }
    if (!o && (!t || t === 'volume')) { const v = lab.getVolume(ref); if (v) o = lab.inspectVolume(v); }
    if (o) objs.push(o); else { errs.push('Error: No such ' + (t ? t : 'object') + ': ' + ref); code = 1; }
  });
  why(st, 'docker inspect', ['Affiche TOUS les détails d\'un objet Docker (conteneur, image, réseau, volume) au format JSON.', 'Utilisez -f avec un modèle Go pour extraire une valeur : docker inspect -f \'{{.State.Status}}\' web', 'Sections utiles : State (état, code de sortie), NetworkSettings (adresses IP), Mounts (volumes), Config (variables d\'environnement).']);
  if (f.format) { objs.forEach(o => st.out(U.goTemplate(f.format, o) + '\n')); } else { st.out(JSON.stringify(objs, null, 4) + '\n'); }
  errs.forEach(e => st.err(e + '\n')); st.done(code);
};
SUB.top = function (args, st) {
  const lab = st.lab; if (!args.length) { st.err('docker: "top" requires at least 1 argument.\nSee \'docker top --help\'.\n'); return st.done(1); }
  let c; try { c = lab.getContainer(args[0]); if (!c) throw noCont(args[0]); } catch (e) { dErr(st, e); return st.done(1); }
  if (!c.running) { st.err('Error response from daemon: container ' + c.id + ' is not running\n'); return st.done(1); }
  const l = NS.procList(c, lab); const base = 10000 + (c.state.pid % 1000);
  st.out(U.table([['UID', 'PID', 'PPID', 'C', 'STIME', 'TTY', 'TIME', 'CMD']].concat(l.map((p, i) => [p.user, String(c.state.pid + i), i ? String(c.state.pid) : String(base), '0', '07:38', '?', '00:00:00', p.cmd])))); st.done(0);
};
SUB.port = function (args, st) {
  const lab = st.lab; if (!args.length) { st.err('docker: "port" requires at least 1 argument.\nSee \'docker port --help\'.\n'); return st.done(1); }
  let c; try { c = lab.getContainer(args[0]); if (!c) throw noCont(args[0]); } catch (e) { dErr(st, e); return st.done(1); }
  const b = c._bound || []; const want = args[1];
  const out = []; b.forEach(p => { if (want && want.replace(/\/tcp$/, '') !== String(p.port)) return; if (want) { out.push(p.ip + ':' + p.hostPort); if (p.ip === '0.0.0.0') out.push('[::]:' + p.hostPort); } else { out.push(p.port + '/' + p.proto + ' -> ' + p.ip + ':' + p.hostPort); if (p.ip === '0.0.0.0') out.push(p.port + '/' + p.proto + ' -> [::]:' + p.hostPort); } });
  if (want && !out.length) { st.err('Error: No public port \'' + want + '\' published for ' + args[0] + '\n'); return st.done(1); }
  st.out(out.join('\n') + (out.length ? '\n' : '')); st.done(0);
};
SUB.rename = function (args, st) { if (args.length !== 2) { st.err('docker: "rename" requires exactly 2 arguments.\nSee \'docker rename --help\'.\n'); return st.done(1); } try { const c = st.lab.getContainer(args[0]); if (!c) throw noCont(args[0]); st.lab.rename(c, args[1]); st.done(0); } catch (e) { dErr(st, e); st.done(1); } };
SUB.pause = function (args, st) { let code = 0; args.forEach(r => { try { const c = st.lab.getContainer(r); if (!c) throw noCont(r); st.lab.pause(c); st.out(r + '\n'); } catch (e) { dErr(st, e); code = 1; } }); st.done(code); };
SUB.unpause = function (args, st) { let code = 0; args.forEach(r => { try { const c = st.lab.getContainer(r); if (!c) throw noCont(r); st.lab.unpause(c); st.out(r + '\n'); } catch (e) { dErr(st, e); code = 1; } }); st.done(code); };
SUB.tag = function (args, st) { if (args.length !== 2) { st.err('docker: "tag" requires exactly 2 arguments.\nSee \'docker tag --help\'.\n\nUsage:  docker tag SOURCE_IMAGE[:TAG] TARGET_IMAGE[:TAG]\n\nCreate a tag TARGET_IMAGE that refers to SOURCE_IMAGE\n'); return st.done(1); } try { st.lab.tagImage(args[0], args[1]); st.done(0); } catch (e) { dErr(st, e); st.done(1); } };
SUB.rmi = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['force|f:b', 'no-prune:b'], false, 'rmi');
  if (err) { st.err(err + '\n'); return st.done(1); }
  if (!rest.length) { st.err('docker: "rmi" requires at least 1 argument.\nSee \'docker rmi --help\'.\n\nUsage:  docker rmi [OPTIONS] IMAGE [IMAGE...]\n\nRemove one or more images\n'); return st.done(1); }
  let code = 0;
  why(st, 'docker rmi', ['Supprime une image locale (ou seulement un de ses tags si elle en a plusieurs).', 'Docker refuse de supprimer une image utilisée par un conteneur, même arrêté : supprimez d\'abord le conteneur (docker rm) ou forcez avec -f.']);
  rest.forEach(ref => { try { lab.removeImage(ref, !!f.force).forEach(l => st.out(l + '\n')); } catch (e) { dErr(st, e); code = 1; } });
  st.done(code);
};
SUB.cp = function (args, st) {
  const lab = st.lab; const ctx = st.ctx; const a = args.filter(x => x[0] !== '-');
  if (a.length !== 2) { st.err('docker: "cp" requires exactly 2 arguments.\nSee \'docker cp --help\'.\n\nUsage:  docker cp [OPTIONS] CONTAINER:SRC_PATH DEST_PATH|-\n\tdocker cp [OPTIONS] SRC_PATH|- CONTAINER:DEST_PATH\n'); return st.done(1); }
  const [src, dst] = a; const sc = /^[\w.-]+:/.test(src) && !src.startsWith('/') && !src.startsWith('.'), dc = /^[\w.-]+:/.test(dst) && !dst.startsWith('/') && !dst.startsWith('.');
  if (sc === dc) { st.err('Error: must specify at least one container source\n'); return st.done(1); }
  const cref = (sc ? src : dst).split(':')[0], cpath = (sc ? src : dst).slice(cref.length + 1);
  let c; try { c = lab.getContainer(cref); if (!c) throw noCont(cref); } catch (e) { dErr(st, e); return st.done(1); }
  const hp = ctx.fs.norm(ctx.cwd, sc ? dst : src); const cp = c.fs.norm('/', cpath);
  const from = sc ? c.fs : ctx.fs, to = sc ? ctx.fs : c.fs; const fp = sc ? cp : hp; let tp = sc ? hp : cp;
  if (!from.exists(fp)) { st.err(sc ? 'Error response from daemon: Could not find the file ' + cpath + ' in container ' + cref + '\n' : 'lstat ' + hp + ': no such file or directory\n'); return st.done(1); }
  if (to.isDir(tp)) tp = (tp === '/' ? '' : tp) + '/' + fp.split('/').pop();
  const n = from.get(fp); if (n.t === 'f') { if (!to.write(tp, n.d)) { st.err('Error response from daemon: Could not find the file ' + tp + ' in container ' + cref + '\n'); return st.done(1); } } else { to.mkdirp(tp); from.copyTree(fp, to, tp); }
  why(st, 'docker cp', ['Copie un fichier ou un dossier entre l\'hôte et le système de fichiers du conteneur (dans les deux sens). Le conteneur n\'a pas besoin d\'être démarré.', 'Attention : ce qui est copié dans le conteneur disparaît avec lui (utilisez un volume pour conserver des données).']);
  st.done(0);
};
const MEM = { nginx: [3.5, 7.6], httpd: [9.2, 7.6], redis: [8.1, 7.6], postgres: [27.4, 7.6], mysql: [420, 7.6], mariadb: [95, 7.6] };
SUB.stats = function (args, st) {
  const lab = st.lab; const { f, rest, err } = parseFlags(args, ['no-stream:b', 'all|a:b', 'no-trunc:b', 'format:s'], false, 'stats'); if (err) { st.err(err + '\n'); return st.done(1); }
  const pick = () => (rest.length ? rest.map(r => lab.getContainer(r)).filter(Boolean) : lab.containers.filter(c => c.running));
  const table = () => { const l = pick(); const rows = [['CONTAINER ID', 'NAME', 'CPU %', 'MEM USAGE / LIMIT', 'MEM %', 'NET I/O', 'BLOCK I/O', 'PIDS']]; l.forEach(c => { const m = MEM[c.spec.repo] || [1.1, 7.6]; const mem = c.running ? m[0] + (c.logs.length % 7) / 10 : 0; rows.push([c.shortId, c.name, c.running ? '0.00%' : '0.00%', c.running ? mem.toFixed(2) + 'MiB / ' + m[1] + 'GiB' : '0B / 0B', c.running ? (mem / (m[1] * 1024) * 100).toFixed(2) + '%' : '0.00%', c.running ? '1.2kB / 0B' : '0B / 0B', '0B / 0B', c.running ? String(1 + (c.procs || []).length) : '0']); }); return U.table(rows); };
  if (rest.length) for (const r of rest) { if (!lab.getContainer(r)) { st.err('Error response from daemon: No such container: ' + r + '\n'); return st.done(1); } }
  if (f['no-stream']) { st.out(table()); return st.done(0); }
  let ev; const tick = () => { st.out('\x1b[clear]' + table()); ev = lab.clock.schedule(1000, tick); }; st.onAbort(() => { lab.clock.cancel(ev); st.done(130); }); tick();
};
SUB.version = function (args, st) {
  st.out('Client: Docker Engine - Community\n Version:           27.3.1\n API version:       1.47\n Go version:        go1.22.7\n Git commit:        ce12230\n Built:             Fri Sep 20 11:41:00 2024\n OS/Arch:           linux/amd64\n Context:           default\n\nServer: Docker Engine - Community\n Engine:\n  Version:          27.3.1\n  API version:      1.47 (minimum version 1.24)\n  Go version:       go1.22.7\n  Git commit:        41ca978\n  Built:            Fri Sep 20 11:41:00 2024\n  OS/Arch:          linux/amd64\n  Experimental:     false\n containerd:\n  Version:          1.7.22\n  GitCommit:        7f7fdf5fed64eb6a7f4f9c8cf6bfa0e0d2d5d1b1\n runc:\n  Version:          1.1.14\n  GitCommit:        v1.1.14-0-g2c9f560\n docker-init:\n  Version:          0.19.0\n  GitCommit:        de40ad0\n'); st.done(0);
};
SUB.info = function (args, st) {
  const lab = st.lab; const run = lab.containers.filter(c => c.state.status === 'running').length, pa = lab.containers.filter(c => c.state.status === 'paused').length, stp = lab.containers.length - run - pa;
  st.out('Client: Docker Engine - Community\n Version:    27.3.1\n Context:    default\n Debug Mode: false\n\nServer:\n Containers: ' + lab.containers.length + '\n  Running: ' + run + '\n  Paused: ' + pa + '\n  Stopped: ' + stp + '\n Images: ' + lab.images.length + '\n Server Version: 27.3.1\n Storage Driver: overlayfs\n  driver-type: io.containerd.snapshotter.v1\n Logging Driver: json-file\n Cgroup Driver: systemd\n Cgroup Version: 2\n Plugins:\n  Volume: local\n  Network: bridge host ipvlan macvlan null overlay\n  Log: awslogs fluentd gcplogs gelf journald json-file local splunk syslog\n Swarm: inactive\n Runtimes: io.containerd.runc.v2 runc\n Default Runtime: runc\n Init Binary: docker-init\n Kernel Version: 6.8.0-45-generic\n Operating System: Ubuntu 24.04.1 LTS\n OSType: linux\n Architecture: x86_64\n CPUs: 4\n Total Memory: 7.755GiB\n Name: ' + lab.hostname + '\n Docker Root Dir: /var/lib/docker\n Debug Mode: false\n Live Restore Enabled: false\n'); st.done(0);
};
NS.dockerSub = SUB; NS.dockerParseFlags = parseFlags; NS.dockerHelpers = { dErr, noCont, why, eachSeq, fmtList, HDR, matchFilter, flagsTable };
})(typeof window !== 'undefined' ? window : globalThis);
