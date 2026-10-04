/* procs.js — processus des conteneurs : lancement via le mini-shell, redis-cli, nginx -t, pg_isready… */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const { U, Shell } = NS;
const q = a => "'" + String(a).replace(/'/g, "'\\''") + "'";

/* lance le processus principal d'un conteneur (hors services scriptés) */

/* mini-interpréteur de scripts : uniquement print()/console.log() de textes, variables simples et variables d'environnement */
NS.runScript = function (lang, code, env) {
  const vars = {}; let out = '';
  const envGet = (k, d) => (env[k] !== undefined ? env[k] : d === undefined ? (lang === 'py' ? null : undefined) : d);
  function str(t) { const m = /^(['"`])([\s\S]*)\1$/.exec(t.trim()); return m ? m[2] : null; }
  function ev(e) {
    e = e.trim(); let m;
    if ((m = /^f(['"])([\s\S]*)\1$/.exec(e))) return m[2].replace(/\{([^}]+)\}/g, (_, x) => { const v = ev(x); return v === null || v === undefined ? 'None' : v; });
    if (lang === 'js' && (m = /^`([\s\S]*)`$/.exec(e))) return m[1].replace(/\$\{([^}]+)\}/g, (_, x) => { const v = ev(x); return v === undefined || v === null ? 'undefined' : v; });
    const s = str(e); if (s !== null) return s;
    if (/^-?\d+(\.\d+)?$/.test(e)) return e;
    if ((m = /^os\.(?:environ\.get|getenv)\(\s*(['"])(\w+)\1\s*(?:,\s*([\s\S]+?))?\)$/.exec(e))) return envGet(m[2], m[3] !== undefined ? ev(m[3]) : undefined);
    if ((m = /^os\.environ\[\s*(['"])(\w+)\1\s*\]$/.exec(e))) return envGet(m[2]);
    if ((m = /^process\.env\.(\w+)(?:\s*(?:\|\||\?\?)\s*([\s\S]+))?$/.exec(e))) { const v = env[m[1]]; return v !== undefined && v !== '' ? v : (m[2] !== undefined ? ev(m[2]) : undefined); }
    if (/^\w+$/.test(e) && vars[e] !== undefined) return vars[e];
    if (e === 'None' || e === 'null' || e === 'undefined') return null;
    return e;
  }
  const splitArgs = a => { const r = []; let d = 0, q = null, cur = ''; for (const ch of a) { if (q) { cur += ch; if (ch === q) q = null; continue; } if ('\'"`'.includes(ch)) { q = ch; cur += ch; continue; } if ('([{'.includes(ch)) d++; if (')]}'.includes(ch)) d--; if (ch === ',' && d === 0) { r.push(cur); cur = ''; } else cur += ch; } if (cur.trim()) r.push(cur); return r; };
  const lines = code.split('\n');
  for (let raw of lines) {
    const l = raw.trim(); if (!l || l[0] === '#' || l.startsWith('//') || /^(import|from|const\s+\w+\s*=\s*require)/.test(l)) continue;
    let m;
    if ((m = /^(?:print|console\.log)\((.*)\);?$/.exec(l))) { out += splitArgs(m[1]).map(a => { const v = ev(a); return v === null || v === undefined ? (lang === 'py' ? 'None' : String(v)) : v; }).join(' ') + '\n'; continue; }
    if ((m = /^(?:(?:const|let|var)\s+)?(\w+)\s*=\s*(.+?);?$/.exec(l))) { vars[m[1]] = ev(m[2]); continue; }
  }
  return { out, err: '', code: 0 };
};

NS.shellLaunch = function (lab, c, eff) {
  const name = eff[0].split('/').pop(); const tok = c.runToken;
  const exit = code => { if (c.runToken === tok && c.state.status === 'running') lab._exit(c, code); };
  const io = { out: t => lab.log(c, t.replace(/\n$/, '')), err: t => lab.log(c, t.replace(/\n$/, ''), 'stderr'), done: exit };
  if (['sh', 'ash', 'bash'].includes(name)) {
    const ci = eff.indexOf('-c');
    if (ci > 0 && eff[ci + 1] !== undefined) {
      const ctx = NS.containerCtx(lab, c, {}); ctx.inScript = true; const sh = new Shell(lab, ctx);
      c.proc = { type: 'proc', handlesTerm: false, abort: () => sh.abort() };
      lab._sched(c, 2, () => sh.run(eff[ci + 1], { out: io.out, err: io.err, done: code => exit(ctx.exited ? ctx.exitCode : code) }));
      return;
    }
    if (c.config.tty && c.config.openStdin) { c.proc = { type: 'shell', handlesTerm: false, interactive: true }; return; }
    if (!(eff[1] && eff[1][0] !== '-')) { c.proc = { type: 'proc', handlesTerm: false }; lab._sched(c, 2, () => exit(0)); return; }
  }
  const ctx = NS.containerCtx(lab, c, {}); ctx.inScript = true; const sh = new Shell(lab, ctx);
  c.proc = { type: 'proc', handlesTerm: false, abort: () => sh.abort() };
  lab._sched(c, 2, () => sh.run(eff.map(q).join(' '), { out: io.out, err: io.err, done: code => exit(ctx.exited ? ctx.exitCode : code) }));
};

/* ------------------------------------------------ redis simulé */
function glob(p) { return new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'); }
NS.redisExec = function (c, lab, argv, tty) {
  const db = c.redis || (c.redis = {}); const cmd = (argv[0] || '').toUpperCase(); const a = argv.slice(1);
  const S = v => tty ? '"' + v + '"' : v; const I = n => tty ? '(integer) ' + n : String(n); const NIL = tty ? '(nil)' : '';
  const L = arr => !arr.length ? (tty ? '(empty array)' : '') : arr.map((x, i) => tty ? (i + 1) + ') "' + x + '"' : x).join('\n');
  switch (cmd) {
    case 'PING': return a[0] ? S(a[0]) : 'PONG';
    case 'ECHO': return S(a[0] || '');
    case 'SET': db[a[0]] = a[1]; return 'OK';
    case 'GET': return db[a[0]] === undefined ? NIL : S(db[a[0]]);
    case 'DEL': { let n = 0; a.forEach(k => { if (db[k] !== undefined) { delete db[k]; n++; } }); return I(n); }
    case 'EXISTS': return I(a.filter(k => db[k] !== undefined).length);
    case 'KEYS': { const re = glob(a[0] || '*'); return L(Object.keys(db).filter(k => re.test(k))); }
    case 'INCR': case 'DECR': case 'INCRBY': case 'DECRBY': { const d = cmd === 'INCR' ? 1 : cmd === 'DECR' ? -1 : cmd === 'INCRBY' ? Number(a[1]) : -Number(a[1]); const cur = db[a[0]] === undefined ? 0 : Number(db[a[0]]); if (isNaN(cur)) return '(error) ERR value is not an integer or out of range'; db[a[0]] = String(cur + d); return I(cur + d); }
    case 'APPEND': db[a[0]] = (db[a[0]] || '') + a[1]; return I(db[a[0]].length);
    case 'STRLEN': return I((db[a[0]] || '').length);
    case 'TYPE': return db[a[0]] === undefined ? 'none' : 'string';
    case 'TTL': return I(db[a[0]] === undefined ? -2 : -1);
    case 'DBSIZE': return I(Object.keys(db).length);
    case 'FLUSHALL': case 'FLUSHDB': Object.keys(db).forEach(k => delete db[k]); return 'OK';
    case 'SELECT': return 'OK';
    case 'SAVE': c.fs.write('/data/dump.rdb', 'REDIS0011\n' + JSON.stringify(db)); return 'OK';
    case 'INFO': return '# Server\nredis_version:' + c.spec.version + '\nredis_mode:standalone\nos:Linux 6.8.0-45-generic x86_64\ntcp_port:6379\nuptime_in_seconds:' + Math.floor((lab.clock.now - c.state.startedAt) / 1000) + '\n\n# Keyspace\n' + (Object.keys(db).length ? 'db0:keys=' + Object.keys(db).length + ',expires=0,avg_ttl=0\n' : '');
    default: return "(error) ERR unknown command '" + (argv[0] || '') + "', with args beginning with: " + a.map(x => "'" + x + "' ").join('');
  }
};
function redisUp(c) { return c.runToken !== undefined && c.running && c.listen.includes(6379); }
const TOOLS = { redis: ['redis-cli', 'redis-server', 'redis-benchmark'], postgres: ['pg_isready', 'psql', 'postgres'], nginx: ['nginx'], httpd: ['httpd', 'httpd-foreground'], node: ['node', 'npm', 'npx', 'yarn'], python: ['python', 'python3', 'pip', 'pip3'], mysql: ['mysqld', 'mysql'], mariadb: ['mariadbd', 'mariadb'] };
NS.hasTool = (c, nm) => (TOOLS[c.spec.repo] || []).includes(nm);
NS.extraCmd = function (sh, nm, args, st) {
  const c = st.ctx.container; const lab = st.lab; const repo = c.spec.repo;
  if (nm === 'redis-cli' && repo === 'redis') {
    const refuse = () => { st.err('Could not connect to Redis at 127.0.0.1:6379: Connection refused\n'); st.done(1); };
    if (!redisUp(c)) return refuse() || true;
    const cmdArgs = args.filter((x, i) => !(x === '-h' || x === '-p' || args[i - 1] === '-h' || args[i - 1] === '-p'));
    if (cmdArgs.length) { st.out(NS.redisExec(c, lab, cmdArgs, st.ctx.tty) + '\n'); st.done(0); return true; }
    if (st.ctx.tty && st.ctx.pushShell) {
      st.ctx.pushShell({ kind: 'redis', prompt: () => '127.0.0.1:6379> ', exec(line, io) { const t = U.shellSplit(line.trim()) || []; if (!t.length) return io.done(); if (/^(quit|exit)$/i.test(t[0])) { this.exited = true; return io.done(); } io.print(NS.redisExec(c, lab, t, true) + '\n'); io.done(); }, onExit() { } });
      st.done(0); return true;
    }
    st.done(0); return true;
  }
  if (nm === 'pg_isready' && repo === 'postgres') { const up = c.running && c.listen.includes(5432); st.out('/var/run/postgresql:5432 - ' + (up ? 'accepting connections' : 'no response') + '\n'); st.done(up ? 0 : 2); return true; }
  if (nm === 'nginx' && repo === 'nginx') {
    const f = args.join(' ');
    if (/^-v$/.test(f)) { st.err('nginx version: nginx/' + c.spec.version + '\n'); st.done(0); return true; }
    if (/^-V$/.test(f)) { st.err('nginx version: nginx/' + c.spec.version + '\nbuilt by gcc 12.2.0 (Debian 12.2.0-14)\n'); st.done(0); return true; }
    if (/^-t/.test(f)) { st.err('nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful\n'); st.done(0); return true; }
    if (/^-s (reload|quit|stop|reopen)$/.test(f)) { st.err(U.nginxError(lab.wall()) + ' [notice] 41#41: signal process started\n'); st.done(0); return true; }
    st.err('nginx: invalid option: "' + (args[0] || '') + '"\n'); st.done(1); return true;
  }
  if (nm === 'httpd' && repo === 'httpd') { st.out('Server version: Apache/' + c.spec.version + ' (Unix)\nServer built:   Oct  4 2024 00:00:00\n'); st.done(0); return true; }
  if (nm === 'psql' && repo === 'postgres') { if (!(c.running && c.listen.includes(5432))) { st.err('psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: No such file or directory\n\tIs the server running locally and accepting connections on that socket?\n'); st.done(2); return true; } st.out('[simulateur] psql n\'est pas simulé : le serveur PostgreSQL répond bien (pg_isready).\n'); st.done(0); return true; }
  if ((nm === 'node' && repo === 'node') || ((nm === 'python' || nm === 'python3') && repo === 'python')) {
    const py = nm !== 'node';
    if (args[0] === '-v' || args[0] === '--version' || args[0] === '-V') { st.out((py ? 'Python ' : 'v') + c.spec.version + '\n'); st.done(0); return true; }
    let code = null, file = null;
    if ((args[0] === '-c' && py) || (args[0] === '-e' && !py)) code = args[1] || ''; else if (args[0] && args[0][0] !== '-') file = args[0];
    if (file) { const path = st.ctx.fs.norm(st.ctx.cwd, file); code = st.ctx.fs.read(path); if (code === null) { st.err((py ? "python: can't open file '" + path + "': [Errno 2] No such file or directory" : 'node:internal/modules/cjs/loader:1228\n  throw err;\n  ^\n\nError: Cannot find module \'' + path + '\'\n    at Module._resolveFilename (node:internal/modules/cjs/loader:1225:15)\n\nNode.js v' + c.spec.version) + '\n'); st.done(py ? 2 : 1); return true; } }
    if (code !== null) { const r = NS.runScript(py ? 'py' : 'js', code, st.ctx.env); if (r.out) st.out(r.out); if (r.err) st.err(r.err); st.done(r.code); return true; }
    st.done(0); return true;
  }
  if ((nm === 'pip' || nm === 'pip3') && repo === 'python') {
    if (args[0] === '--version') { st.out('pip 24.2 from /usr/local/lib/python3/site-packages/pip (python ' + c.spec.version.replace(/\.\d+$/, '') + ')\n'); st.done(0); return true; }
    if (args[0] !== 'install') { st.err('ERROR: unknown command "' + (args[0] || '') + '"\n'); st.done(1); return true; }
    let names = args.slice(1).filter(x => x[0] !== '-' && args[args.indexOf(x) - 1] !== '-r');
    const ri = args.indexOf('-r'); if (ri >= 0) { const t = st.ctx.fs.read(st.ctx.fs.norm(st.ctx.cwd, args[ri + 1] || '')); if (t === null) { st.err('ERROR: Could not open requirements file: [Errno 2] No such file or directory: \'' + (args[ri + 1] || '') + '\'\n'); st.done(1); return true; } names = t.split('\n').map(x => x.trim()).filter(x => x && x[0] !== '#'); }
    const V = { flask: '3.0.3', requests: '2.32.3', numpy: '2.1.2', django: '5.1.1', pytest: '8.3.3' }; const bare = names.map(x => x.split(/[=<>~! ]/)[0].toLowerCase());
    if (!bare.length) { st.err('ERROR: You must give at least one requirement to install (see "pip help install")\n'); st.done(1); return true; }
    const ev = lab.wait(900 + bare.length * 500, () => { let o = ''; bare.forEach((n, i) => { const v = (names[i].split('==')[1]) || V[n] || '1.0.0'; o += 'Collecting ' + names[i] + '\n  Downloading ' + n + '-' + v + '-py3-none-any.whl (' + (80 + i * 17) + ' kB)\n'; c.pkgs['pip:' + n] = true; });
      o += 'Installing collected packages: ' + bare.join(', ') + '\nSuccessfully installed ' + bare.map((n, i) => n + '-' + ((names[i].split('==')[1]) || V[n] || '1.0.0')).join(' ') + '\n'; if (!c.runningBuild) o += '\n[notice] A new release of pip is available: 24.2 -> 24.3.1\n[notice] To update, run: pip install --upgrade pip\n'; st.out(o); st.done(0); });
    st.onAbort(() => { lab.clock.cancel(ev); st.done(130); }); return true;
  }
  if ((nm === 'npm' || nm === 'npx') && repo === 'node') {
    if (args[0] === '--version' || args[0] === '-v') { st.out('10.8.3\n'); st.done(0); return true; }
    if (!['install', 'i', 'ci'].includes(args[0])) { st.err('npm error [Docker Lab] seule « npm install » est simulée\n'); st.done(1); return true; }
    let names = args.slice(1).filter(x => x[0] !== '-');
    if (!names.length) { const pj = st.ctx.fs.read(st.ctx.fs.norm(st.ctx.cwd, 'package.json')); if (pj === null) { st.err('npm error code ENOENT\nnpm error syscall open\nnpm error path ' + st.ctx.fs.norm(st.ctx.cwd, 'package.json') + '\nnpm error errno -2\nnpm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open \'' + st.ctx.fs.norm(st.ctx.cwd, 'package.json') + '\'\n'); st.done(254); return true; } try { names = Object.keys(JSON.parse(pj).dependencies || {}); } catch (e) { st.err('npm error code EJSONPARSE\nnpm error JSON.parse Invalid package.json\n'); st.done(1); return true; } }
    const n = names.length * 3 + (names.length ? 2 : 0);
    const ev = lab.wait(1200 + names.length * 600, () => { names.forEach(x => { c.pkgs['npm:' + x] = true; }); st.ctx.fs.mkdirp(st.ctx.fs.norm(st.ctx.cwd, 'node_modules')); st.out('\nadded ' + n + ' packages, and audited ' + (n + 1) + ' packages in ' + (1 + names.length) + 's\n\nfound 0 vulnerabilities\n'); st.done(0); });
    st.onAbort(() => { lab.clock.cancel(ev); st.done(130); }); return true;
  }
  return false;
};
})(typeof window !== 'undefined' ? window : globalThis);
