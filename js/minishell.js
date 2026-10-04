/* minishell.js — mini-shell (hôte et conteneurs) : variables, $(…), pipes, redirections, jokers et commandes courantes */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const { U, VFS } = NS;
const CMDS = NS.CMDS = {};

/* ------------------------------------------------ contexte d'exécution */
function baseOf(c) { return c.spec.base; }
function isBB(ctx) { return ctx.base === 'alpine' || ctx.base === 'busybox'; }
NS.hostCtx = function (lab) {
  return { kind: 'host', lab, fs: lab.hostFs, cwd: '/home/student', env: { HOME: '/home/student', USER: 'student', PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', SHELL: '/bin/bash', LANG: 'en_US.UTF-8', HOSTNAME: lab.hostname, PWD: '/home/student', TERM: 'xterm' }, user: 'student', hostname: lab.hostname, container: null, tty: true, base: 'host', style: 'gnu', code: 0, pkgs: {},
    prompt() { const h = this.env.HOME; let p = this.cwd === h ? '~' : this.cwd.startsWith(h + '/') ? '~' + this.cwd.slice(h.length) : this.cwd; return 'student@' + this.hostname + ':' + p + '$ '; } };
};
NS.containerCtx = function (lab, c, o) {
  o = o || {}; const base = baseOf(c); const env = c.envMap(); env.HOME = env.HOME || (base === 'scratch' ? '/' : '/root'); env.PWD = o.workdir || c.config.workdir || '/'; if (o.tty) env.TERM = 'xterm'; if (!env.PATH) env.PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
  (o.env || []).forEach(e => { const i = e.indexOf('='); env[e.slice(0, i)] = e.slice(i + 1); });
  const ctx = { kind: 'container', lab, fs: c.fs, cwd: o.workdir || c.config.workdir || '/', env, user: o.user || c.config.user || 'root', hostname: c.config.hostname, container: c, tty: !!o.tty, base, style: (base === 'alpine' || base === 'busybox') ? 'bb' : 'gnu', code: 0, shname: o.shname, pkgs: c.pkgs,
    prompt() { const home = this.env.HOME; const p = this.cwd === home ? '~' : this.cwd; return (base === 'alpine' || base === 'busybox') ? p + ' # ' : 'root@' + this.hostname + ':' + p + '# '; } };
  return ctx;
};

/* ------------------------------------------------ disponibilité des commandes selon l'image */
const BB_ONLY = ['ps', 'ip', 'ifconfig', 'nslookup', 'wget', 'ping', 'top'];
const PKG_CMDS = { curl: ['curl'], wget: ['wget'], procps: ['ps', 'top', 'free'], 'iputils-ping': ['ping'], iproute2: ['ip'], 'net-tools': ['ifconfig', 'netstat'], dnsutils: ['nslookup', 'dig'], nano: ['nano'], vim: ['vim', 'vi'], bash: ['bash'], 'bind-tools': ['nslookup', 'dig'], iputils: ['ping'] };
function installed(ctx, cmd) { return Object.keys(ctx.pkgs).some(p => ctx.pkgs[p] && (PKG_CMDS[p] || []).includes(cmd)); }
function available(ctx, name) {
  const d = CMDS[name]; if (!d) return false;
  if (d.host && ctx.kind !== 'host') return false;
  if (d.only && !d.only(ctx)) return false;
  if (ctx.kind === 'host') return !d.cont;
  if (d.cont === false) return false;
  if (ctx.base === 'scratch') return false;
  if (BB_ONLY.includes(name)) return isBB(ctx) ? !(name === 'ping' && false) : installed(ctx, name);
  if (name === 'curl' || name === 'nano' || name === 'vim') return installed(ctx, name);
  if (name === 'bash') return !isBB(ctx) || installed(ctx, 'bash');
  if (name === 'wget') return isBB(ctx) || installed(ctx, 'wget');
  if (name === 'ash') return isBB(ctx);
  return true;
}
NS.shellCanRun = function (lab, c, eff) {
  const name = eff[0]; const base = c.spec.base;
  if (base === 'scratch') return name.startsWith('/') ? 'stat ' + name + ': no such file or directory' : 'executable file not found in $PATH';
  const ctx = NS.containerCtx(lab, c); const bn = name.split('/').pop();
  if (name.startsWith('/')) { const known = ['/bin/sh', '/bin/bash', '/bin/ash', '/bin/ls', '/bin/cat', '/bin/echo', '/bin/sleep', '/usr/bin/env', '/bin/ping', '/usr/bin/curl'].includes(name) || c.fs.isFile(name) || (c.spec.svc && name.endsWith('/' + c.spec.svc)); if (!known && !c.fs.isFile(name)) return 'stat ' + name + ': no such file or directory'; if (bn === 'bash' && !available(ctx, 'bash')) return 'stat ' + name + ': no such file or directory'; return null; }
  if (['sh'].includes(bn)) return null;
  return (available(ctx, bn) || (NS.hasTool && NS.hasTool(c, bn))) ? null : 'executable file not found in $PATH';
};

/* ------------------------------------------------ expansion des mots */
function expandWord(parts, ctx, sh) {
  const fields = ['']; let quoted = false, glob = false, first = true;
  const last = () => fields.length - 1;
  const newField = () => { if (fields[last()] !== '' || quoted) fields.push(''); };
  for (const p of parts) {
    if (p.m === 's') { fields[last()] += p.t; quoted = true; first = false; continue; }
    if (p.m === 'd') quoted = true;
    const t = p.t; let buf = '';
    for (let i = 0; i < t.length;) {
      const ch = t[i];
      if (ch === '$') {
        let val = null, adv = 1;
        if (t[i + 1] === '(') { let d = 1, k = i + 2; while (k < t.length && d) { if (t[k] === '(') d++; else if (t[k] === ')') d--; k++; } val = sh.captureSync(t.slice(i + 2, k - 1)); adv = k - i; }
        else if (t[i + 1] === '{') { const k = t.indexOf('}', i); const nm = t.slice(i + 2, k < 0 ? t.length : k); const m = /^(\w+):-(.*)$/.exec(nm); val = m ? (ctx.env[m[1]] || m[2]) : (ctx.env[nm] || ''); adv = (k < 0 ? t.length : k + 1) - i; }
        else if (t[i + 1] === '?') { val = String(ctx.code); adv = 2; }
        else { const m = /^\w+/.exec(t.slice(i + 1)); if (m) { val = ctx.env[m[0]] || ''; adv = 1 + m[0].length; } }
        if (val === null) { buf += '$'; i++; continue; }
        if (p.m === 'd') { buf += val; } else {
          const lead = /^\s/.test(val), trail = /\s$/.test(val), pcs = val.split(/\s+/).filter(Boolean);
          if (!pcs.length) { if (lead || trail) { fields[last()] += buf; buf = ''; newField(); } } else {
            fields[last()] += buf; buf = ''; if (lead) newField(); fields[last()] += pcs[0];
            for (let k = 1; k < pcs.length; k++) { fields.push(pcs[k]); }
            if (trail) fields.push('');
          }
        }
        i += adv; first = false; continue;
      }
      if (p.m === 'p' && ch === '~' && first && fields[0] === '' && (i + 1 >= t.length || t[i + 1] === '/')) { buf += ctx.env.HOME || '/'; i++; first = false; continue; }
      if (p.m === 'p' && /[*?]/.test(ch)) glob = true;
      buf += ch; i++; first = false;
    }
    fields[last()] += buf;
  }
  const out = fields.filter((f, i) => f !== '' || quoted);
  return { words: out, glob: glob && !quoted };
}
function globExpand(word, ctx) {
  if (!/[*?]/.test(word)) return [word];
  const abs = word.startsWith('/'); const segs = word.split('/').filter(Boolean); let cur = [abs ? '/' : ''];
  for (const sg of segs) {
    const next = [];
    for (const base of cur) {
      if (!/[*?]/.test(sg)) { const pth = (base === '' ? '' : base === '/' ? '/' : base + '/') + sg; if (ctx.fs.exists(ctx.fs.norm(ctx.cwd, pth))) next.push(pth); continue; }
      const dir = ctx.fs.norm(ctx.cwd, base || '.'); const names = ctx.fs.list(dir) || [];
      const re = new RegExp('^' + sg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      names.filter(n => re.test(n) && (n[0] !== '.' || sg[0] === '.')).forEach(n => next.push((base === '' ? '' : base === '/' ? '/' : base + '/') + n));
    }
    cur = next;
  }
  return cur.length ? cur.sort() : [word];
}

/* ------------------------------------------------ le shell */
class Shell {
  constructor(lab, ctx) { this.lab = lab; this.ctx = ctx; this.cur = null; this.aborted = false; this.depth = 0; }
  captureSync(line) {
    if (this.depth > 5) return '';
    let out = ''; const sub = new Shell(this.lab, Object.assign(Object.create(this.ctx), { cwd: this.ctx.cwd, env: Object.assign({}, this.ctx.env) })); sub.depth = this.depth + 1;
    sub.run(line, { out: t => { out += t; }, err: () => { }, done: () => { } });
    return out.replace(/\n+$/, '');
  }
  abort() { this.aborted = true; if (this.cur && this.cur.abort) this.cur.abort(); }
  /* exécute une ligne ; io = { out, err, done(code) } */
  run(line, io) {
    this.aborted = false; let cmds;
    try { cmds = U.parseLine(line); } catch (e) { io.err('bash: ' + e.message + '\n'); this.ctx.code = 2; io.done(2); return; }
    if (cmds.length === 1 && !cmds[0].words.length && !cmds[0].redir.length) { io.done(this.ctx.code); return; }
    // regroupe en pipelines
    const pipes = []; let cur = []; let link = null;
    cmds.forEach(c => { cur.push(c); if (c.sep !== '|') { pipes.push({ cmds: cur, link }); link = c.sep; cur = []; } });
    if (cur.length) pipes.push({ cmds: cur, link });
    let i = 0;
    const next = () => {
      if (this.aborted) { this.ctx.code = 130; return io.done(130); }
      if (i >= pipes.length || this.ctx.exited) return io.done(this.ctx.code);
      const p = pipes[i++];
      if (p.link === '&&' && this.ctx.code !== 0) return next();
      if (p.link === '||' && this.ctx.code === 0) return next();
      this.runPipeline(p.cmds, io, code => { this.ctx.code = code; next(); });
    };
    next();
  }
  runPipeline(cmds, io, cb) {
    let stdin = null; let k = 0;
    const stage = () => {
      if (k >= cmds.length) return;
      const cmd = cmds[k]; const lastStage = k === cmds.length - 1; k++;
      let buf = ''; const redirOut = cmd.redir.find(r => r.op === '>' || r.op === '>>' || r.op === '&>'); const redirErr = cmd.redir.find(r => r.op === '2>' || r.op === '2>>');
      const merge = cmd.redir.some(r => r.op === '2>&1'); let eBuf = '';
      const toOut = !redirOut && lastStage; let fileData = '';
      const o = t => { if (redirOut) fileData += t; else if (toOut) io.out(t); else buf += t; };
      const e = t => { if (merge) o(t); else if (redirErr) eBuf += t; else io.err(t); };
      const fin = code => {
        const ctx = this.ctx;
        const wr = (r, data) => { if (!r) return; const tgtw = expandWord(r.target, ctx, this).words[0] || ''; if (tgtw === '/dev/null') return; const f = ctx.fs.norm(ctx.cwd, tgtw); if (!NS.canWrite(ctx, f) || !ctx.fs.write(f, data, r.op.endsWith('>>'))) io.err((ctx.style === 'bb' ? 'sh: can\'t create ' + tgtw + ': ' : ctx.shname === 'sh' ? 'sh: 1: cannot create ' + tgtw + ': ' : 'bash: ' + tgtw + ': ') + (ctx.fs.isRo && ctx.fs.isRo(f) ? 'Read-only file system' : NS.canWrite(ctx, f) ? 'No such file or directory' : 'Permission denied') + '\n'); };
        if (redirOut) wr(redirOut, fileData); if (redirErr) wr(redirErr, eBuf);
        if (lastStage) return cb(code);
        stdin = buf; stage();
      };
      this.runSimple(cmd, stdin, o, e, fin);
    };
    stage();
  }
  runSimple(cmd, stdin, out, err, done) {
    const ctx = this.ctx; let words = [];
    try { cmd.words.forEach(w => { const r = expandWord(w, ctx, this); r.words.forEach(x => { if (r.glob) globExpand(x, ctx).forEach(y => words.push(y)); else words.push(x); }); }); } catch (e) { err(e.message + '\n'); return done(1); }
    // affectations VAR=val
    const tmp = {}; while (words.length && /^[A-Za-z_]\w*=/.test(words[0])) { const w = words.shift(); const i = w.indexOf('='); tmp[w.slice(0, i)] = w.slice(i + 1); }
    if (!words.length) { Object.assign(ctx.env, tmp); return done(0); }
    if (words[0] === 'sudo' && ctx.kind === 'host') { words.shift(); while (words[0] && words[0].startsWith('-')) words.shift(); if (!words.length) return done(0); }
    const name = words[0]; const args = words.slice(1);
    const saved = {}; Object.keys(tmp).forEach(k => { saved[k] = ctx.env[k]; ctx.env[k] = tmp[k]; });
    let fin = false; const self = this;
    const finish = code => { if (fin) return; fin = true; if (self.cur && self.cur.owner === st) self.cur = null; Object.keys(tmp).forEach(k => { if (saved[k] === undefined) delete ctx.env[k]; else ctx.env[k] = saved[k]; }); done(code); };
    const st = { ctx, sh: this, lab: this.lab, stdin, args, out, err, done: finish, tty: ctx.tty, onAbort: fn => { self.cur = { abort: fn, owner: st }; }, fail(msg, code) { err(msg + '\n'); finish(code === undefined ? 1 : code); } };
    this.runCommand(name, args, st);
  }
  runCommand(name, args, st) {
    const ctx = this.ctx; const bn = name.includes('/') ? name.split('/').pop() : name;
    if (name.includes('/') && !ctx.fs.isFile(ctx.fs.norm(ctx.cwd, name)) && !(['/bin/sh', '/bin/bash', '/bin/ash', '/bin/ls', '/bin/cat', '/bin/echo', '/usr/bin/env', '/bin/sleep', '/bin/ping', '/usr/bin/curl'].includes(name))) { if (ctx.fs.isDir(ctx.fs.norm(ctx.cwd, name))) return st.fail((ctx.style === 'bb' ? 'sh: ' : 'bash: ') + name + ': Is a directory', 126); return st.fail((ctx.style === 'bb' ? 'sh: ' : 'bash: ') + name + ': ' + (ctx.style === 'bb' ? 'not found' : 'No such file or directory'), 127); }
    if (ctx.kind === 'container' && /^\.?\.?\//.test(name) && !name.startsWith('/bin/') && !name.startsWith('/usr/')) { const fp = ctx.fs.norm(ctx.cwd, name); const nd = ctx.fs.get(fp); if (nd && nd.t === 'f' && nd.x) return CMDS.sh.f([fp], st); return st.fail((ctx.style === 'bb' ? 'sh: ' : 'bash: ') + name + ': Permission denied', 126); }
    const nm = (ctx.kind === 'host' || ctx.style === 'bb' || true) ? bn : name;
    if (!available(ctx, nm)) {
      if (ctx.kind === 'container' && ctx.container && NS.extraCmd && NS.extraCmd(this, nm, args, st)) return;
      const interactive = ctx.tty;
      return st.fail(ctx.style === 'bb' ? (st.ctx.inScript ? 'sh: ' : '/bin/sh: ') + nm + ': not found' : (ctx.kind === 'host' ? nm + ': command not found' : 'bash: ' + (st.ctx.inScript ? 'line 1: ' : '') + nm + ': command not found'), 127);
    }
    const d = CMDS[nm]; st.cmdName = nm;
    try { d.f(args, st); } catch (e) { st.err((e && e.message ? e.message : String(e)) + '\n'); st.done(1); }
  }
}
NS.Shell = Shell;

NS.canWrite = function (ctx, f) { if (ctx.fs.isRo && ctx.fs.isRo(f)) return false; if (ctx.kind !== 'host') return true; return /^\/(home\/student|tmp|var\/tmp)(\/|$)/.test(f) || ctx.fs.locate(f).fs !== ctx.fs; };

/* ------------------------------------------------ aides */
const fmtErr = (ctx, cmd, path, kind) => {
  const bb = ctx.style === 'bb';
  if (kind === 'enoent') return cmd + ': ' + (cmd === 'ls' && !bb ? "cannot access '" + path + "': " : (bb && cmd === 'cat' ? "can't open '" + path + "': " : path + ': ')) + 'No such file or directory';
  if (kind === 'isdir') return cmd + ': ' + path + ': Is a directory';
  if (kind === 'perm') return cmd + ': ' + (bb ? "can't create '" + path + "'" : "cannot create directory '" + path + "'") + ': Permission denied';
  return cmd + ': ' + path;
};
const abs = (st, p) => st.ctx.fs.norm(st.ctx.cwd, p);
const defn = (names, f, extra) => { [].concat(names).forEach(n => { CMDS[n] = Object.assign({ f }, extra || {}); }); };
const optsOf = (args, spec) => { const o = {}; const rest = []; let end = false; for (const a of args) { if (end || a === '-' || a[0] !== '-' || a.length < 2) { rest.push(a); continue; } if (a === '--') { end = true; continue; } if (a.startsWith('--')) { o[a.slice(2)] = true; continue; } for (const ch of a.slice(1)) o[ch] = true; } return { o, rest }; };

defn('printf', (args, st) => {
  if (!args.length) return st.fail('printf: usage: printf [-v var] format [arguments]', 2);
  const un = t => t.replace(/\\([nt\\"']|0[0-7]{0,2}|x[0-9a-fA-F]{1,2})/g, (m, c) => c === 'n' ? '\n' : c === 't' ? '\t' : c === '\\' ? '\\' : c === '"' ? '"' : c === "'" ? "'" : c[0] === 'x' ? String.fromCharCode(parseInt(c.slice(1), 16)) : String.fromCharCode(parseInt(c, 8) || 0));
  const fmt = args[0]; let rest = args.slice(1); let out = '';
  do { let used = false; out += fmt.replace(/%(%|-?\d*s|d|i)/g, (m, c) => { if (c === '%') return '%'; used = true; const v = rest.length ? rest.shift() : ''; if (c === 'd' || c === 'i') return String(parseInt(v, 10) || 0); const w = parseInt(c, 10); const t = String(v); return isNaN(w) ? t : (c[0] === '-' ? t.padEnd(-w) : t.padStart(w)); }).replace(/\\([nt\\"']|0[0-7]{0,2}|x[0-9a-fA-F]{1,2})/g, (m, c) => un(m)); if (!used) break; } while (rest.length);
  st.out(out); st.done(0);
});
defn(['chmod', 'chown', 'chgrp'], (args, st) => {
  const nm = st.cmdName || 'chmod'; const rest = args.filter(a => !/^-[Rrfv]+$/.test(a)); if (rest.length < 2) return st.fail(nm + ": missing operand" + (rest.length ? " after '" + rest[0] + "'" : ''), 1);
  let code = 0; rest.slice(1).forEach(a => { const p = abs(st, a); if (!st.ctx.fs.exists(p)) { st.err((st.ctx.style === 'bb' ? nm + ": " + a + ': No such file or directory' : nm + ": cannot access '" + a + "': No such file or directory") + '\n'); code = 1; } else if (nm === 'chmod' && !NS.canWrite(st.ctx, p) === false && (/^[0-7]*[1357]$|\+x|a\+x|u\+x/.test(rest[0]) ? (st.ctx.fs.get(p).x = true) : (/^[0-7]+$|-x/.test(rest[0]) ? (st.ctx.fs.get(p).x = false) : 0), false)) { /* mode appliqué */ } else if (!NS.canWrite(st.ctx, p)) { st.err(nm + ": changing permissions of '" + a + "': " + (st.ctx.fs.isRo && st.ctx.fs.isRo(p) ? 'Read-only file system' : 'Operation not permitted') + '\n'); code = 1; } });
  st.done(code);
});
defn('ln', (args, st) => { const r = args.filter(a => a[0] !== '-'); if (r.length < 2) return st.fail('ln: missing file operand', 1); const t = abs(st, r[1]); if (st.ctx.fs.exists(t)) return st.fail("ln: failed to create symbolic link '" + r[1] + "': File exists", 1); st.ctx.fs.write(t, st.ctx.fs.read(abs(st, r[0])) || ''); st.done(0); });
defn(['adduser', 'addgroup', 'useradd', 'groupadd'], (args, st) => { const nmA = args.filter(a => a[0] !== '-' && !/^\d+$/.test(a)).pop(); if (!nmA) return st.fail('Usage: adduser [OPTIONS] USER [GROUP]', 1); const f = st.ctx.fs; const pw = f.read('/etc/passwd') || ''; if (new RegExp('^' + nmA + ':', 'm').test(pw) && /user/.test(st.cmdName || 'adduser')) return st.fail((st.ctx.style === 'bb' ? 'adduser: user \'' + nmA + '\' in use' : "useradd: user '" + nmA + "' already exists"), st.ctx.style === 'bb' ? 1 : 9); if (!/group/.test(st.cmdName || '')) f.write('/etc/passwd', pw + nmA + ':x:' + (1000 + pw.split('\n').length) + ':' + (1000 + pw.split('\n').length) + '::/home/' + nmA + ':/bin/sh\n'); st.done(0); });
defn('echo', (args, st) => { let nl = true, esc = false; while (args[0] && /^-[neE]+$/.test(args[0])) { if (args[0].includes('n')) nl = false; if (args[0].includes('e')) esc = true; args = args.slice(1); } let s = args.join(' '); if (esc) s = s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\'); st.out(s + (nl ? '\n' : '')); st.done(0); });
defn('true', (a, st) => st.done(0)); defn('false', (a, st) => st.done(1));
defn('pwd', (a, st) => { st.out(st.ctx.cwd + '\n'); st.done(0); });
defn('cd', (args, st) => { const ctx = st.ctx; const t = args[0] === undefined ? ctx.env.HOME : args[0] === '-' ? (ctx.oldcwd || ctx.cwd) : args[0]; const p = abs(st, t); if (!ctx.fs.exists(p)) return st.fail(ctx.style === 'bb' ? 'sh: cd: can\'t cd to ' + t + ': No such file or directory' : 'bash: cd: ' + t + ': No such file or directory', 1); if (!ctx.fs.isDir(p)) return st.fail((ctx.style === 'bb' ? 'sh: cd: can\'t cd to ' : 'bash: cd: ') + t + (ctx.style === 'bb' ? ': Not a directory' : ': Not a directory'), 1); ctx.oldcwd = ctx.cwd; ctx.cwd = p; ctx.env.PWD = p; st.done(0); });
defn('export', (args, st) => { args.forEach(a => { const i = a.indexOf('='); if (i > 0) st.ctx.env[a.slice(0, i)] = a.slice(i + 1); }); st.done(0); });
defn('unset', (args, st) => { args.forEach(a => delete st.ctx.env[a]); st.done(0); });
defn(['env', 'printenv'], (args, st) => { const e = st.ctx.env; if (args.length) { const k = args[0]; if (e[k] === undefined) return st.done(1); st.out(e[k] + '\n'); return st.done(0); } const skip = new Set(['PWD', 'SHELL', 'LANG', 'USER']); const keys = Object.keys(e).filter(k => st.ctx.kind === 'host' || !skip.has(k) || k === 'PWD'); const order = st.ctx.kind === 'container' ? keys.filter(k => k !== 'HOME' && k !== 'PWD' && k !== 'TERM') : keys; st.out(order.concat(st.ctx.kind === 'container' ? ['HOME'].concat(e.TERM ? ['TERM'] : []).filter(k => keys.includes(k)).concat(keys.includes('PWD') ? ['PWD'] : []) : []).filter((k, i, a) => a.indexOf(k) === i).map(k => k + '=' + e[k]).join('\n') + '\n'); st.done(0); });
defn('clear', (a, st) => { st.out('\x1b[clear]'); st.done(0); });
defn('whoami', (a, st) => { st.out((st.ctx.kind === 'host' ? 'student' : (st.ctx.user || 'root')) + '\n'); st.done(0); });
defn('id', (a, st) => { st.out(st.ctx.kind === 'host' ? 'uid=1000(student) gid=1000(student) groups=1000(student),27(sudo),999(docker)\n' : 'uid=0(root) gid=0(root) groups=0(root)' + (st.ctx.base === 'alpine' ? ',0(root),1(bin),2(daemon),3(sys),4(adm),6(disk),10(wheel),11(floppy),20(dialout),26(tape),27(video)' : '') + '\n'); st.done(0); });
defn('hostname', (a, st) => { st.out(st.ctx.hostname + '\n'); st.done(0); });
defn('uname', (args, st) => { const f = args.join(' '); const bb = st.ctx.style === 'bb'; const host = st.ctx.hostname; const k = '6.8.0-45-generic'; const v = '#45-Ubuntu SMP PREEMPT_DYNAMIC Fri Aug 30 12:02:04 UTC 2024'; let s; if (/-a/.test(f)) s = 'Linux ' + host + ' ' + k + ' ' + v + ' x86_64 ' + (bb ? 'Linux' : 'GNU/Linux'); else if (/-r/.test(f)) s = k; else if (/-m/.test(f)) s = 'x86_64'; else if (/-n/.test(f)) s = host; else s = 'Linux'; st.out(s + '\n'); st.done(0); });
defn('date', (a, st) => { st.out(U.dateLine(st.lab.wall()) + '\n'); st.done(0); });
defn('sleep', (args, st) => { const n = parseFloat(args[0]); if (isNaN(n)) return st.fail('sleep: invalid time interval \'' + (args[0] || '') + '\'\nTry \'sleep --help\' for more information.', 1); const ev = st.lab.clock.schedule(n * 1000, () => st.done(0)); st.onAbort(() => { st.lab.clock.cancel(ev); st.done(130); }); });
defn('exit', (args, st) => { st.ctx.exited = true; st.ctx.exitCode = args[0] !== undefined ? Number(args[0]) & 255 : st.ctx.code; st.done(st.ctx.exitCode); });
defn('which', (args, st) => { let c = 0; args.forEach(a => { if (available(st.ctx, a)) st.out('/usr/bin/' + a + '\n'); else c = 1; }); st.done(c); });

defn('cat', (args, st) => {
  const { o, rest } = optsOf(args); let code = 0;
  if (!rest.length) { st.out(st.stdin || ''); return st.done(0); }
  rest.forEach(a => { const p = abs(st, a); if (a === '-') { st.out(st.stdin || ''); return; } if (!st.ctx.fs.exists(p)) { st.err(fmtErr(st.ctx, 'cat', a, 'enoent') + '\n'); code = 1; return; } if (st.ctx.fs.isDir(p)) { st.err('cat: ' + a + ': Is a directory\n'); code = 1; return; } let d = st.ctx.fs.read(p); if (o.n) d = d.split('\n').map((l, i, ar) => (i === ar.length - 1 && l === '' ? '' : String(i + 1).padStart(6) + '\t' + l)).join('\n'); st.out(d); });
  st.done(code);
});
const perm = n => n.t === 'd' ? 'drwxr-xr-x' : (n.m || '-rw-r--r--');
defn('ls', (args, st) => {
  const { o, rest } = optsOf(args); const ctx = st.ctx; const fs = ctx.fs; const targets = rest.length ? rest : ['.']; let code = 0; const showAll = o.a || o.A; const long = o.l;
  const own = ctx.kind === 'host' ? 'student' : 'root'; const d = new Date(st.lab.wall()); const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const when = MON[d.getUTCMonth()] + ' ' + String(d.getUTCDate()).padStart(2) + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  const line = (name, node) => { const sz = node.t === 'd' ? 4096 : node.d.length; const sizeS = o.h ? U.humanSize(sz).replace(/B$/, '') : String(sz); return ctx.style === 'bb' ? perm(node) + '    1 ' + own.padEnd(8) + ' ' + own.padEnd(8) + ' ' + String(sizeS).padStart(8) + ' ' + when + ' ' + name : perm(node) + ' ' + (node.t === 'd' ? '2' : '1') + ' ' + own + ' ' + own + ' ' + String(sizeS).padStart(Math.max(1, 5)) + ' ' + when + ' ' + name; };
  const cols = names => { if (!ctx.tty || long || o[1]) return names.join('\n') + (names.length ? '\n' : ''); const w = Math.max.apply(null, names.map(n => n.length)) + 2; const nc = Math.max(1, Math.floor(80 / w)); const nr = Math.ceil(names.length / nc); let s = ''; for (let r = 0; r < nr; r++) { const row = []; for (let c = 0; c < nc; c++) { const n = names[c * nr + r]; if (n !== undefined) row.push(n); } s += row.map((n, i) => i < row.length - 1 ? n.padEnd(w) : n).join('') + '\n'; } return s; };
  targets.forEach((t, ti) => {
    const p = abs(st, t); const node = fs.get(p);
    if (!node) { st.err((ctx.style === 'bb' ? 'ls: ' + t + ': No such file or directory' : "ls: cannot access '" + t + "': No such file or directory") + '\n'); code = ctx.style === 'bb' ? 1 : 2; return; }
    if (node.t === 'f') { st.out(long ? line(t, node) + '\n' : t + '\n'); return; }
    if (targets.length > 1) st.out((ti ? '\n' : '') + t + ':\n');
    let names = fs.list(p).filter(n => showAll || n[0] !== '.'); if (o.a) names = ['.', '..'].concat(names);
    if (long) { const lines = names.map(n => { const cn = (n === '.' || n === '..') ? { t: 'd' } : fs.get(p === '/' ? '/' + n : p + '/' + n) || { t: 'd' }; return line(n, cn); }); st.out('total ' + Math.max(0, names.length * 4) + '\n' + lines.join('\n') + (lines.length ? '\n' : '')); } else st.out(cols(names));
  });
  st.done(code);
});
defn('mkdir', (args, st) => { const { o, rest } = optsOf(args); let code = 0; rest.forEach(a => { const p = abs(st, a); if (!NS.canWrite(st.ctx, p)) { st.err("mkdir: cannot create directory '" + a + "': " + (st.ctx.fs.isRo && st.ctx.fs.isRo(p) ? 'Read-only file system' : 'Permission denied') + "\n"); code = 1; return; } if (st.ctx.fs.exists(p)) { if (!o.p) { st.err((st.ctx.style === 'bb' ? "mkdir: can't create directory '" + a + "': File exists" : "mkdir: cannot create directory '" + a + "': File exists") + '\n'); code = 1; } return; } const parent = p.slice(0, p.lastIndexOf('/')) || '/'; if (!o.p && !st.ctx.fs.isDir(parent)) { st.err((st.ctx.style === 'bb' ? "mkdir: can't create directory '" + a + "': No such file or directory" : "mkdir: cannot create directory '" + a + "': No such file or directory") + '\n'); code = 1; return; } st.ctx.fs.mkdirp(p); }); st.done(code); });
defn('touch', (args, st) => { let code = 0; args.forEach(a => { const p = abs(st, a); if (!NS.canWrite(st.ctx, p)) { st.err("touch: cannot touch '" + a + "': " + (st.ctx.fs.isRo && st.ctx.fs.isRo(p) ? 'Read-only file system' : 'Permission denied') + "\n"); code = 1; return; } if (st.ctx.fs.exists(p)) return; if (!st.ctx.fs.write(p, '')) { st.err((st.ctx.style === 'bb' ? "touch: " + a + ': No such file or directory' : "touch: cannot touch '" + a + "': No such file or directory") + '\n'); code = 1; } }); st.done(code); });
defn('rm', (args, st) => { const { o, rest } = optsOf(args); let code = 0; rest.forEach(a => { const p = abs(st, a); if (!NS.canWrite(st.ctx, p)) { st.err("rm: cannot remove '" + a + "': " + (st.ctx.fs.isRo && st.ctx.fs.isRo(p) ? 'Read-only file system' : 'Permission denied') + "\n"); code = 1; return; } if (!st.ctx.fs.exists(p)) { if (!o.f) { st.err((st.ctx.style === 'bb' ? "rm: can't remove '" + a + "': No such file or directory" : "rm: cannot remove '" + a + "': No such file or directory") + '\n'); code = 1; } return; } if (st.ctx.fs.isDir(p) && !(o.r || o.R)) { st.err((st.ctx.style === 'bb' ? "rm: can't remove '" + a + "': Is a directory" : "rm: cannot remove '" + a + "': Is a directory") + '\n'); code = 1; return; } st.ctx.fs.remove(p, true); }); st.done(code); });
defn('cp', (args, st) => { const { o, rest } = optsOf(args); if (rest.length < 2) return st.fail('cp: missing file operand', 1); const dst = abs(st, rest[rest.length - 1]); let code = 0; rest.slice(0, -1).forEach(a => { const s = abs(st, a); const n = st.ctx.fs.get(s); if (!n) { st.err("cp: cannot stat '" + a + "': No such file or directory\n"); code = 1; return; } if (n.t === 'd' && !(o.r || o.R)) { st.err("cp: -r not specified; omitting directory '" + a + "'\n"); code = 1; return; } let to = dst; if (st.ctx.fs.isDir(dst)) to = dst + '/' + s.split('/').pop(); if (!NS.canWrite(st.ctx, to)) { st.err("cp: cannot create regular file '" + rest[rest.length - 1] + "': " + (st.ctx.fs.isRo && st.ctx.fs.isRo(p) ? 'Read-only file system' : 'Permission denied') + "\n"); code = 1; return; } if (n.t === 'f') st.ctx.fs.write(to, n.d); else { st.ctx.fs.mkdirp(to); st.ctx.fs.copyTree(s, st.ctx.fs, to); } }); st.done(code); });
defn('mv', (args, st) => { const { rest } = optsOf(args); if (rest.length < 2) return st.fail('mv: missing file operand', 1); const dst = abs(st, rest[rest.length - 1]); let code = 0; rest.slice(0, -1).forEach(a => { const s = abs(st, a); const n = st.ctx.fs.get(s); if (!n) { st.err("mv: cannot stat '" + a + "': No such file or directory\n"); code = 1; return; } let to = dst; if (st.ctx.fs.isDir(dst)) to = dst + '/' + s.split('/').pop(); if (n.t === 'f') st.ctx.fs.write(to, n.d); else { st.ctx.fs.mkdirp(to); st.ctx.fs.copyTree(s, st.ctx.fs, to); } st.ctx.fs.remove(s, true); }); st.done(code); });
const lines_ = s => { const a = s.split('\n'); if (a[a.length - 1] === '') a.pop(); return a; };
const input = (st, files) => files.length ? files.map(f => { const p = abs(st, f); return st.ctx.fs.read(p); }).filter(x => x !== null).join('') : (st.stdin || '');
defn('head', (args, st) => { let n = 10; const rest = []; for (let i = 0; i < args.length; i++) { if (args[i] === '-n') n = Number(args[++i]); else if (/^-\d+$/.test(args[i])) n = Number(args[i].slice(1)); else rest.push(args[i]); } st.out(lines_(input(st, rest)).slice(0, n).join('\n') + '\n'); st.done(0); });
defn('tail', (args, st) => { let n = 10; const rest = []; for (let i = 0; i < args.length; i++) { if (args[i] === '-n') n = Number(args[++i]); else if (/^-\d+$/.test(args[i])) n = Number(args[i].slice(1)); else rest.push(args[i]); } const l = lines_(input(st, rest)); st.out(l.slice(Math.max(0, l.length - n)).join('\n') + (l.length ? '\n' : '')); st.done(0); });
defn('wc', (args, st) => { const { o, rest } = optsOf(args); const s = input(st, rest); const l = (s.match(/\n/g) || []).length, w = s.split(/\s+/).filter(Boolean).length, c = s.length; const parts = []; if (o.l) parts.push(l); if (o.w) parts.push(w); if (o.c) parts.push(c); if (!parts.length) parts.push(l, w, c); st.out(parts.join(' ') + (rest.length ? ' ' + rest[0] : '') + '\n'); st.done(0); });
defn('sort', (args, st) => { const { o, rest } = optsOf(args); let l = lines_(input(st, rest)); l.sort(o.n ? (a, b) => parseFloat(a) - parseFloat(b) : undefined); if (o.r) l.reverse(); if (o.u) l = l.filter((x, i) => l.indexOf(x) === i); st.out(l.join('\n') + (l.length ? '\n' : '')); st.done(0); });
defn('uniq', (args, st) => { const { o, rest } = optsOf(args); const l = lines_(input(st, rest)); const out = []; l.forEach(x => { const last = out[out.length - 1]; if (last && last.t === x) last.n++; else out.push({ t: x, n: 1 }); }); st.out(out.map(x => (o.c ? String(x.n).padStart(7) + ' ' : '') + x.t).join('\n') + (out.length ? '\n' : '')); st.done(0); });
defn('tee', (args, st) => { const { o, rest } = optsOf(args); const s = st.stdin || ''; st.out(s); rest.forEach(f => st.ctx.fs.write(abs(st, f), s, !!o.a)); st.done(0); });
defn('cut', (args, st) => { let d = '\t', f = '1'; for (let i = 0; i < args.length; i++) { if (args[i] === '-d') d = args[++i]; else if (args[i].startsWith('-d')) d = args[i].slice(2); else if (args[i] === '-f') f = args[++i]; else if (args[i].startsWith('-f')) f = args[i].slice(2); } const idx = f.split(',').map(x => Number(x) - 1); st.out(lines_(st.stdin || '').map(l => { const p = l.split(d); return idx.map(i => p[i]).filter(x => x !== undefined).join(d); }).join('\n') + '\n'); st.done(0); });
defn('grep', (args, st) => {
  const { o, rest } = optsOf(args.filter(a => a !== '-e')); if (!rest.length) return st.fail('Usage: grep [OPTIONS] PATTERN [FILE]...', 2);
  let re; try { re = new RegExp(rest[0], o.i ? 'i' : ''); } catch (e) { return st.fail('grep: Unmatched [, [^, [:, [., or [=', 2); }
  const files = rest.slice(1); const srcs = files.length ? files.map(f => ({ n: f, d: st.ctx.fs.read(abs(st, f)) })) : [{ n: '', d: st.stdin || '' }]; let any = false, cnt = 0;
  srcs.forEach(s => { if (s.d === null) { st.err('grep: ' + s.n + ': No such file or directory\n'); return; } lines_(s.d).forEach((l, i) => { const m = re.test(l); if (m !== !!o.v) { any = true; cnt++; if (!o.c) st.out((files.length > 1 ? s.n + ':' : '') + (o.n ? (i + 1) + ':' : '') + l + '\n'); } }); });
  if (o.c) st.out(cnt + '\n'); st.done(any ? 0 : 1);
});
defn(['sh', 'bash', 'ash'], (args, st) => {
  const ci = args.indexOf('-c'); const ctx = st.ctx;
  if (ci >= 0 && args[ci + 1] !== undefined) {
    const sub = Object.assign(Object.create(ctx), { cwd: ctx.cwd, env: Object.assign({}, ctx.env), inScript: true, exited: false, code: 0 }); const sh = new Shell(st.lab, sub); st.onAbort(() => sh.abort());
    return sh.run(args[ci + 1], { out: st.out, err: st.err, done: code => st.done(sub.exited ? sub.exitCode : code) });
  }
  if (st.stdin !== null && st.stdin !== undefined && args.length === 0) { const sub = Object.assign(Object.create(ctx), { cwd: ctx.cwd, env: Object.assign({}, ctx.env), inScript: true, exited: false, code: 0 }); const sh = new Shell(st.lab, sub); return sh.run(st.stdin.split('\n').filter(Boolean).join(';'), { out: st.out, err: st.err, done: st.done }); }
  if (args.length && ctx.fs.isFile(abs(st, args[0]))) { const sub = Object.assign(Object.create(ctx), { cwd: ctx.cwd, env: Object.assign({}, ctx.env), inScript: true, exited: false, code: 0 }); const sh = new Shell(st.lab, sub); return sh.run(ctx.fs.read(abs(st, args[0])).split('\n').filter(l => l && l[0] !== '#').join(';'), { out: st.out, err: st.err, done: st.done }); }
  if (args.length) return st.fail('sh: ' + args[0] + ': No such file or directory', 127);
  st.out(''); st.done(0);
});
defn(['vi', 'vim', 'nano'], (args, st) => { if (st.ctx.kind === 'host' && NS.hostEditor) { return NS.hostEditor(st, args[0]); } st.fail('[simulateur] éditeur non disponible dans ce terminal : utilisez echo "texte" > fichier', 1); });

/* ------------------------------------------------ outils réseau (curl, wget, ping, nslookup, ip) */
function fmtHeaders(res) { return 'HTTP/1.1 ' + res.status + ' ' + res.reason + '\r\n' + Object.keys(res.headers).map(k => k + ': ' + res.headers[k]).join('\r\n') + '\r\n\r\n'; }
defn('curl', (args, st) => {
  const o = { s: false, S: false, I: false, i: false, v: false, X: 'GET', o: null, w: null, m: null }; let url = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-X' || a === '--request') o.X = args[++i]; else if (a === '-o' || a === '--output') o.o = args[++i]; else if (a === '-w' || a === '--write-out') o.w = args[++i]; else if (a === '-m' || a === '--max-time' || a === '-H' || a === '--header' || a === '-d' || a === '--data' || a === '-A' || a === '-u' || a === '--connect-timeout') { i++; }
    else if (a === '--head') o.I = true; else if (a === '--silent') o.s = true; else if (a === '--show-error') o.S = true; else if (a === '--include') o.i = true; else if (a === '--verbose') o.v = true; else if (a === '--fail') o.f = true;
    else if (a[0] === '-' && a.length > 1 && a[1] !== '-') { for (const ch of a.slice(1)) { if (ch === 's') o.s = true; else if (ch === 'S') o.S = true; else if (ch === 'I') o.I = true; else if (ch === 'i') o.i = true; else if (ch === 'v') o.v = true; else if (ch === 'f') o.f = true; } }
    else if (a[0] !== '-') url = a;
  }
  if (o.V || o.version || args.includes('--version')) { st.out('curl 8.5.0 (x86_64-pc-linux-gnu) libcurl/8.5.0 OpenSSL/3.0.13 zlib/1.3\nRelease-Date: 2023-12-06\nProtocols: dict file ftp ftps gopher gophers http https imap imaps ldap ldaps mqtt pop3 pop3s rtmp rtsp scp sftp smb smbs smtp smtps telnet tftp\nFeatures: alt-svc AsynchDNS HSTS HTTPS-proxy IPv6 Largefile NTLM SSL threadsafe TLS-SRP UnixSockets\n'); return st.done(0); }
  if (!url) return st.fail('curl: try \'curl --help\' or \'curl --manual\' for more information', 2);
  const method = o.I ? 'HEAD' : o.X;
  const r = st.lab.httpFetch(st.ctx.container, url, { method, ua: 'curl/8.5.0' });
  const finish = () => {
    if (r.err) { if (!o.s || o.S) st.err('curl: (' + r.err.code + ') ' + r.err.msg + '\n'); return st.done(r.err.code); }
    const res = r.res; let out = '';
    if (o.v) out += '';
    if (o.I || o.i) out += fmtHeaders(res);
    if (!o.I) out += res.body;
    if (o.f && res.status >= 400) { if (!o.s || o.S) st.err('curl: (22) The requested URL returned error: ' + res.status + '\n'); return st.done(22); }
    if (o.o && o.o !== '/dev/null') { st.ctx.fs.write(abs(st, o.o), res.body); if (o.I || o.i) { /* en-têtes dans le fichier non gérés */ } } else if (!o.o) st.out(out); else if (o.i || o.I) { /* sink */ }
    if (o.w) st.out(o.w.replace(/%\{http_code\}/g, String(res.status)).replace(/\\n/g, '\n'));
    st.done(0);
  };
  if (r.err && r.err.delay) { const ev = st.lab.wait(r.err.delay, finish); st.onAbort(() => { st.lab.clock.cancel(ev); st.done(130); }); } else finish();
}, { only: ctx => true });
defn('wget', (args, st) => {
  const o = { q: false, O: null }; let url = null; for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === '-O') o.O = args[++i]; else if (a.startsWith('-O')) o.O = a.slice(2); else if (a === '-q' || a === '--quiet') o.q = true; else if (/^-q/.test(a)) { o.q = true; if (a.includes('O')) o.O = a.slice(a.indexOf('O') + 1) || args[++i]; } else if (a[0] !== '-') url = a; }
  if (!url) return st.fail('wget: missing URL', 1);
  const host = url.replace(/^https?:\/\//, '').split(/[/:?]/)[0]; const r = st.lab.httpFetch(st.ctx.container, url, {});
  const finish = () => {
    if (r.err) { if (r.err.code === 6) return st.fail('wget: bad address \'' + host + '\'', 1); if (!o.q) st.out('Connecting to ' + host + ' (' + (r.ip || host) + ':80)\n'); return st.fail('wget: can\'t connect to remote host (' + (st.lab.resolveName(st.ctx.container, host) || { ip: host }).ip + '): ' + (r.err.code === 28 ? 'Operation timed out' : 'Connection refused'), 1); }
    if (r.res.status >= 400) { if (!o.q) st.out('Connecting to ' + host + ' (' + (r.ip || host) + ':80)\n'); return st.fail('wget: server returned error: HTTP/1.1 ' + r.res.status + ' ' + r.res.reason, 1); }
    if (o.O === '-') { st.out(r.res.body); return st.done(0); }
    const fn = o.O || (url.replace(/^https?:\/\/[^/]*/, '').split('?')[0].split('/').pop() || 'index.html'); st.ctx.fs.write(abs(st, fn), r.res.body);
    if (!o.q) st.out('Connecting to ' + host + ' (' + (r.ip || host) + ':80)\nsaving to \'' + fn + '\'\n' + fn.padEnd(20) + ' 100% |********************************|' + String(r.res.body.length).padStart(6) + '  0:00:00 ETA\n\'' + fn + '\' saved\n');
    st.done(0);
  };
  if (r.err && r.err.delay) { const ev = st.lab.wait(r.err.delay, finish); st.onAbort(() => { st.lab.clock.cancel(ev); st.done(130); }); } else finish();
});
defn('ping', (args, st) => {
  const { o } = optsOf(args.filter(a => !/^\d+$/.test(a))); let count = Infinity; const rest = []; for (let i = 0; i < args.length; i++) { if (args[i] === '-c') count = Number(args[++i]); else if (args[i] === '-W' || args[i] === '-w' || args[i] === '-i' || args[i] === '-s') i++; else if (args[i][0] !== '-') rest.push(args[i]); }
  const name = rest[0]; if (!name) return st.fail(st.ctx.style === 'bb' ? 'BusyBox v1.36.1 (2024-06-15 10:14:54 UTC) multi-call binary.\n\nUsage: ping [OPTIONS] HOST' : 'ping: usage error: Destination address required', 1);
  const bb = st.ctx.style === 'bb'; const from = st.ctx.container; const t = st.lab.resolveName(from, name);
  if (!t) return st.fail(bb ? "ping: bad address '" + name + "'" : 'ping: ' + name + ': Name or service not known', bb ? 1 : 2);
  let reach = false, tgt = null;
  if (t.self) reach = true; else if (t.internet) reach = !from || !from.netList().every(n => n === 'none'); else { tgt = st.lab.containerByIp(t.ip); if (tgt && (!from || st.lab.canReach(from, tgt))) reach = true; else if (!tgt && NS.INTERNET_IPS[t.ip]) reach = !from || !from.netList().every(n => n === 'none'); else if (!tgt && from && st.lab.networks.some(n => n.gateway === t.ip && from.nets[n.name])) reach = true; }
  const ip = t.ip; const label = name === ip ? ip : name; let seq = 0, got = 0; const rtts = [];
  st.out(bb ? 'PING ' + label + ' (' + ip + '): 56 data bytes\n' : 'PING ' + label + ' (' + ip + ') 56(84) bytes of data.\n');
  let ev = null; const rnd = () => (0.05 + st.lab.rng() * 0.09);
  const stats = () => {
    const loss = seq ? Math.round((seq - got) / seq * 100) : 0; const mn = rtts.length ? Math.min.apply(null, rtts) : 0, mx = rtts.length ? Math.max.apply(null, rtts) : 0, av = rtts.length ? rtts.reduce((a, b) => a + b, 0) / rtts.length : 0;
    if (bb) st.out('\n--- ' + label + ' ping statistics ---\n' + seq + ' packets transmitted, ' + got + ' packets received, ' + loss + '% packet loss\n' + (got ? 'round-trip min/avg/max = ' + mn.toFixed(3) + '/' + av.toFixed(3) + '/' + mx.toFixed(3) + ' ms\n' : ''));
    else st.out('\n--- ' + label + ' ping statistics ---\n' + seq + ' packets transmitted, ' + got + ' received, ' + loss + '% packet loss, time ' + Math.max(0, (seq - 1) * 1000 + Math.round(rnd() * 100)) + 'ms\n' + (got ? 'rtt min/avg/max/mdev = ' + mn.toFixed(3) + '/' + av.toFixed(3) + '/' + mx.toFixed(3) + '/' + (mx - mn).toFixed(3) + ' ms\n' : ''));
  };
  const tick = () => {
    seq++;
    if (reach) { got++; const r = t.internet || NS.INTERNET_IPS[ip] ? 8 + st.lab.rng() * 3 : rnd(); rtts.push(r); st.out(bb ? '64 bytes from ' + ip + ': seq=' + (seq - 1) + ' ttl=' + (t.internet || NS.INTERNET_IPS[ip] ? 112 : 64) + ' time=' + r.toFixed(3) + ' ms\n' : '64 bytes from ' + (tgt && name !== ip ? name + ' (' + ip + ')' : ip) + ': icmp_seq=' + seq + ' ttl=' + (t.internet ? 112 : 64) + ' time=' + r.toFixed(3) + ' ms\n'); }
    else if (!bb) st.out('From ' + (from ? from.primaryIp() : '172.17.0.1') + ' icmp_seq=' + seq + ' Destination Host Unreachable\n');
    if (seq >= count) { stats(); return st.done(got ? 0 : 1); }
    ev = st.lab.clock.schedule(1000, tick);
  };
  st.onAbort(() => { st.lab.clock.cancel(ev); stats(); st.done(130); });
  tick();
});
defn('nslookup', (args, st) => {
  const name = args[0]; if (!name) return st.fail('BusyBox v1.36.1 multi-call binary.\n\nUsage: nslookup [-type=QUERY_TYPE] [-debug] HOST [DNS_SERVER]', 1);
  const t = st.lab.resolveName(st.ctx.container, name); const user = st.ctx.container && st.ctx.container.netList().some(n => { const x = st.lab.getNetwork(n); return x && !x.builtin; });
  const srv = user ? '127.0.0.11' : '192.168.65.7';
  let s = 'Server:\t\t' + srv + '\nAddress:\t' + srv + ':53\n\n';
  if (!t || t.self && name === 'localhost' && false) { st.out(s + "** server can't find " + name + ': NXDOMAIN\n\n'); return st.done(1); }
  st.out(s + 'Non-authoritative answer:\nName:\t' + name + '\nAddress: ' + t.ip + '\n\n'); st.done(0);
});
function ipAddr(c, lab) {
  let s = '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN qlen 1000\n    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n    inet 127.0.0.1/8 scope host lo\n       valid_lft forever preferred_lft forever\n';
  let k = 0; c.netList().forEach(nm => { const e = c.nets[nm]; if (!e.ip) return; const n = lab.getNetwork(nm); const bits = Number(n.subnet.split('/')[1]); const p = e.ip.split('.').map(Number); const mask = bits >= 16 ? [255, 255, 255, 255].map((x, i) => i < 2 ? 255 : (bits - 16 >= (i - 1) * 8 ? 255 : 0)) : [255, 0, 0, 0]; const brd = p.map((x, i) => bits >= 16 ? (i < 2 ? x : 255) : (i < 1 ? x : 255)).join('.'); s += (k + 2) + ': eth' + k + '@if' + (10 + k * 2) + ': <BROADCAST,MULTICAST,UP,LOWER_UP,M-DOWN> mtu 1500 qdisc noqueue state UP \n    link/ether ' + e.mac + ' brd ff:ff:ff:ff:ff:ff\n    inet ' + e.ip + '/' + bits + ' brd ' + brd + ' scope global eth' + k + '\n       valid_lft forever preferred_lft forever\n'; k++; });
  return s;
}
defn('ip', (args, st) => { const c = st.ctx.container; if (!c) return st.fail('Command \'ip\' not found', 127); if (/^(a|addr|address)\b/.test(args.join(' ')) || args.length === 0 || /^-?[a-z]*\s*a/.test(args[0])) { st.out(ipAddr(c, st.lab)); return st.done(0); } if (args[0] === 'route' || args[0] === 'r') { const e = c.netList().map(n => ({ n: st.lab.getNetwork(n), e: c.nets[n] })).find(x => x.e.ip); if (e) st.out('default via ' + e.e.gateway + ' dev eth0 \n' + e.n.subnet.replace(/\.0\/(\d+)$/, '.0/$1') + ' dev eth0 scope link  src ' + e.e.ip + '\n'); return st.done(0); } st.out(''); st.done(0); });
defn('ifconfig', (args, st) => { const c = st.ctx.container; if (!c) return st.done(1); let k = 0; let s = ''; c.netList().forEach(nm => { const e = c.nets[nm]; if (!e.ip) return; const n = st.lab.getNetwork(nm); const bits = Number(n.subnet.split('/')[1]); const p = e.ip.split('.').map(Number); s += 'eth' + k + '      Link encap:Ethernet  HWaddr ' + e.mac.toUpperCase() + '  \n          inet addr:' + e.ip + '  Bcast:' + p[0] + '.' + p[1] + '.255.255  Mask:' + (bits === 16 ? '255.255.0.0' : '255.255.255.0') + '\n          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1\n          RX packets:' + (10 + k) + ' errors:0 dropped:0 overruns:0 frame:0\n          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0\n          collisions:0 txqueuelen:0 \n          RX bytes:1006 (1006.0 B)  TX bytes:0 (0.0 B)\n\n'; k++; }); s += 'lo        Link encap:Local Loopback  \n          inet addr:127.0.0.1  Mask:255.0.0.0\n          UP LOOPBACK RUNNING  MTU:65536  Metric:1\n          RX packets:0 errors:0 dropped:0 overruns:0 frame:0\n          TX packets:0 errors:0 dropped:0 overruns:0 carrier:0\n          collisions:0 txqueuelen:1000 \n          RX bytes:0 (0.0 B)  TX bytes:0 (0.0 B)\n\n'; st.out(s); st.done(0); });
defn(['ps', 'top'], (args, st) => {
  const c = st.ctx.container; if (!c) return st.done(1);
  const list = NS.procList(c, st.lab); const bb = st.ctx.style === 'bb';
  if (bb) { st.out('PID   USER     TIME  COMMAND\n' + list.map(p => String(p.pid).padStart(5) + ' ' + p.user.padEnd(8) + ' ' + p.time.padStart(5) + ' ' + p.cmd).join('\n') + '\n    ' + (list.length + 7) + ' root      0:00 ps\n'); }
  else { st.out('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND\n' + list.map(p => p.user.padEnd(8) + String(p.pid).padStart(7) + '  0.0  0.0   4620  3396 ?        Ss   07:38   0:00 ' + p.cmd).join('\n') + '\nroot     ' + String(list.length + 7).padStart(7) + '  0.0  0.0   7064  1572 pts/0    R+   07:38   0:00 ps aux\n'); }
  st.done(0);
});
/* liste de processus d'un conteneur (utilisée aussi par docker top) */
NS.procList = function (c, lab) {
  const l = []; const user = c.config.user || 'root'; const main = c.proc && c.proc.type === 'service' && c.procs.length ? c.procs[0] : c.displayCmd().replace(/^\/docker-entrypoint\.sh /, '') || '/bin/sh';
  l.push({ pid: 1, user, time: '0:00', cmd: main });
  (c.procs || []).slice(1).forEach((p, i) => l.push({ pid: 29 + i, user: c.spec.repo === 'nginx' ? 'nginx' : user, time: '0:00', cmd: p }));
  return l;
};
defn('uptime', (a, st) => { st.out(' 07:38:10 up 3 days,  2:14,  0 users,  load average: 0.00, 0.01, 0.00\n'); st.done(0); });

/* ------------------------------------------------ gestionnaires de paquets simulés */
const APK = { curl: { v: '8.9.1-r2', deps: ['ca-certificates (20240705-r0)', 'libcurl (8.9.1-r2)'], sz: 7 }, bash: { v: '5.2.26-r0', deps: ['ncurses-terminfo-base (6.4_p20240420-r0)', 'libncursesw (6.4_p20240420-r0)', 'readline (8.2.10-r0)'], sz: 2 }, nano: { v: '8.0-r0', deps: ['libmagic (5.45-r1)'], sz: 4 }, vim: { v: '9.1.0707-r0', deps: ['xxd (9.1.0707-r0)'], sz: 40 }, 'bind-tools': { v: '9.18.27-r0', deps: ['libuv (1.48.0-r0)', 'bind-libs (9.18.27-r0)'], sz: 6 }, iputils: { v: '20240117-r0', deps: [], sz: 1 }, wget: { v: '1.24.5-r0', deps: [], sz: 1 }, jq: { v: '1.7.1-r0', deps: ['oniguruma (6.9.9-r0)'], sz: 1 } };
defn('apk', (args, st) => {
  if (!st.ctx.container) return st.fail('apk: command not found', 127);
  const sub = args[0]; const pk = args.slice(1).filter(a => a[0] !== '-');
  if (sub === 'update') { st.out('fetch https://dl-cdn.alpinelinux.org/alpine/v3.20/main/x86_64/APKINDEX.tar.gz\nfetch https://dl-cdn.alpinelinux.org/alpine/v3.20/community/x86_64/APKINDEX.tar.gz\nv3.20.3-197-g5a7e2d6b8f0 [https://dl-cdn.alpinelinux.org/alpine/v3.20/main]\nv3.20.3-198-g4b8d5c3a1e9 [https://dl-cdn.alpinelinux.org/alpine/v3.20/community]\nOK: 24174 distinct packages available\n'); return st.done(0); }
  if (sub === 'add') {
    if (!pk.length) return st.fail('apk: no packages specified', 1);
    const bad = pk.find(p => !APK[p] && !st.ctx.pkgs[p]); if (bad) { st.err('ERROR: unable to select packages:\n  ' + bad + ' (no such package):\n    required by: world[' + bad + ']\n'); return st.done(1); }
    const todo = []; pk.forEach(p => { APK[p].deps.forEach(d => todo.push(d)); todo.push(p + ' (' + APK[p].v + ')'); });
    const netOk = !st.ctx.container.netList().every(n => n === 'none');
    if (!netOk) { st.err('ERROR: https://dl-cdn.alpinelinux.org/alpine/v3.20/main: DNS lookup error\nWARNING: updating and opening https://dl-cdn.alpinelinux.org/alpine/v3.20/main: temporary error (try again later)\nERROR: unable to select packages:\n  ' + pk[0] + ' (no such package):\n    required by: world[' + pk[0] + ']\n'); return st.done(1); }
    let s = args.includes('--no-cache') ? 'fetch https://dl-cdn.alpinelinux.org/alpine/v3.20/main/x86_64/APKINDEX.tar.gz\nfetch https://dl-cdn.alpinelinux.org/alpine/v3.20/community/x86_64/APKINDEX.tar.gz\n' : '';
    todo.forEach((t, i) => { s += '(' + (i + 1) + '/' + todo.length + ') Installing ' + t + '\n'; });
    const mb = 8 + pk.reduce((a, p) => a + APK[p].sz, 0); s += 'Executing busybox-1.36.1-r29.trigger\nOK: ' + mb + ' MiB in ' + (14 + todo.length) + ' packages\n';
    const ev = st.lab.wait(400 + todo.length * 120, () => { pk.forEach(p => { st.ctx.pkgs[p] = true; }); st.out(s); st.done(0); }); st.onAbort(() => { st.lab.clock.cancel(ev); st.done(130); }); return;
  }
  st.fail('apk-tools 2.14.4, compiled for x86_64.\n\nusage: apk add|update|del ...', 1);
});
const APT = { curl: { v: '7.88.1-10+deb12u7', deps: ['libcurl4', 'libnghttp2-14', 'libssh2-1'], sz: 315 }, wget: { v: '1.21.3-1+b2', deps: ['libpsl5'], sz: 984 }, procps: { v: '2:4.0.2-3', deps: ['libproc2-0'], sz: 705 }, 'iputils-ping': { v: '3:20221126-1', deps: ['libcap2-bin'], sz: 49 }, iproute2: { v: '6.1.0-3', deps: ['libbpf1', 'libmnl0'], sz: 1050 }, 'net-tools': { v: '2.10-0.1', deps: [], sz: 250 }, dnsutils: { v: '1:9.18.28-1', deps: ['bind9-dnsutils'], sz: 160 }, nano: { v: '7.2-1', deps: [], sz: 690 }, vim: { v: '2:9.0.1378-2', deps: ['vim-runtime'], sz: 1560 } };
defn(['apt-get', 'apt'], (args, st) => {
  if (!st.ctx.container) return st.fail('apt: command not found', 127);
  const c = st.ctx.container; const sub = args.find(a => a[0] !== '-'); const yes = args.includes('-y') || args.includes('--yes') || args.includes('-qq'); const ubuntu = st.ctx.base === 'ubuntu';
  const netOk = !c.netList().every(n => n === 'none');
  if (sub === 'update') {
    if (!netOk) { st.out('Err:1 http://deb.debian.org/debian bookworm InRelease\n  Temporary failure resolving \'deb.debian.org\'\nReading package lists...\n'); st.err('W: Failed to fetch http://deb.debian.org/debian/dists/bookworm/InRelease  Temporary failure resolving \'deb.debian.org\'\nW: Some index files failed to download. They have been ignored, or old ones used instead.\n'); return st.done(100); }
    const s = ubuntu ? 'Get:1 http://archive.ubuntu.com/ubuntu noble InRelease [256 kB]\nGet:2 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]\nGet:3 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]\nGet:4 http://archive.ubuntu.com/ubuntu noble/main amd64 Packages [1808 kB]\nGet:5 http://archive.ubuntu.com/ubuntu noble/universe amd64 Packages [19.3 MB]\nFetched 21.9 MB in 3s (7306 kB/s)\nReading package lists...\n' : 'Get:1 http://deb.debian.org/debian bookworm InRelease [151 kB]\nGet:2 http://deb.debian.org/debian bookworm-updates InRelease [55.4 kB]\nGet:3 http://deb.debian.org/debian-security bookworm-security InRelease [48.0 kB]\nGet:4 http://deb.debian.org/debian bookworm/main amd64 Packages [8906 kB]\nGet:5 http://deb.debian.org/debian bookworm-updates/main amd64 Packages [8856 B]\nGet:6 http://deb.debian.org/debian-security bookworm-security/main amd64 Packages [172 kB]\nFetched 9342 kB in 2s (4571 kB/s)\nReading package lists...\n';
    const ev = st.lab.wait(1500, () => { c.aptUpdated = true; st.out(s); st.done(0); }); st.onAbort(() => { st.lab.clock.cancel(ev); st.done(130); }); return;
  }
  if (sub === 'install') {
    if (args[0] === 'apt' || st.ctx.__apt) { }
    const pk = args.slice(args.indexOf('install') + 1).filter(a => a[0] !== '-');
    let hdr = 'Reading package lists...\nBuilding dependency tree...\nReading state information...\n';
    if (!pk.length) return st.fail('E: No packages specified', 100);
    if (!c.aptUpdated || pk.some(p => !APT[p])) { const bad = pk.find(p => !APT[p] || !c.aptUpdated); st.out(hdr); st.err('E: Unable to locate package ' + bad + '\n'); return st.done(100); }
    if (!yes && !st.ctx.tty) { st.out(hdr + 'The following NEW packages will be installed:\n  ' + pk.join(' ') + '\n0 upgraded, ' + pk.length + ' newly installed, 0 to remove and 0 not upgraded.\nNeed to get ' + pk.reduce((a, p) => a + APT[p].sz, 0) + ' kB of archives.\nAfter this operation, ' + pk.reduce((a, p) => a + APT[p].sz * 3, 0) + ' kB of additional disk space will be used.\nDo you want to continue? [Y/n] Abort.\n'); return st.done(1); }
    if (!netOk) { st.out(hdr); st.err('E: Failed to fetch http://deb.debian.org/debian/pool/main/c/curl: Temporary failure resolving \'deb.debian.org\'\n'); return st.done(100); }
    const deps = []; pk.forEach(p => APT[p].deps.forEach(d => deps.push(d)));
    let s = hdr + (deps.length ? 'The following additional packages will be installed:\n  ' + deps.join(' ') + '\n' : '') + 'The following NEW packages will be installed:\n  ' + deps.concat(pk).join(' ') + '\n0 upgraded, ' + (deps.length + pk.length) + ' newly installed, 0 to remove and 0 not upgraded.\nNeed to get ' + pk.reduce((a, p) => a + APT[p].sz, 0) + ' kB of archives.\nAfter this operation, ' + pk.reduce((a, p) => a + APT[p].sz * 3, 0) + ' kB of additional disk space will be used.\n';
    deps.concat(pk).forEach((p, i) => { s += 'Get:' + (i + 1) + ' http://deb.debian.org/debian bookworm/main amd64 ' + p + ' amd64 ' + (APT[p] ? APT[p].v : '1.0') + '\n'; });
    s += 'Fetched ' + pk.reduce((a, p) => a + APT[p].sz, 0) + ' kB in 1s (1200 kB/s)\n'; deps.concat(pk).forEach(p => { s += 'Selecting previously unselected package ' + p + '.\nUnpacking ' + p + ' ...\n'; }); deps.concat(pk).forEach(p => { s += 'Setting up ' + p + ' (' + (APT[p] ? APT[p].v : '1.0') + ') ...\n'; }); s += 'Processing triggers for libc-bin (2.36-9+deb12u8) ...\n';
    const ev = st.lab.wait(1200, () => { pk.forEach(p => { c.pkgs[p] = true; }); st.out(s); st.done(0); }); st.onAbort(() => { st.lab.clock.cancel(ev); st.done(130); }); return;
  }
  st.fail('E: Invalid operation ' + (sub || ''), 100);
});
})(typeof window !== 'undefined' ? window : globalThis);
