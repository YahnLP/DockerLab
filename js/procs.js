/* procs.js — processus des conteneurs : lancement via le mini-shell, redis-cli, nginx -t, pg_isready… */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const { U, Shell } = NS;
const q = a => "'" + String(a).replace(/'/g, "'\\''") + "'";

/* lance le processus principal d'un conteneur (hors services scriptés) */
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
    c.proc = { type: 'proc', handlesTerm: false }; lab._sched(c, 2, () => exit(0)); return;
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
  if (nm === 'node' && repo === 'node') { if (args[0] === '-v' || args[0] === '--version') { st.out('v' + c.spec.version + '\n'); st.done(0); return true; } if (args[0] === '-e' && args[1]) { const m = /console\.log\((['"`])(.*?)\1\)/.exec(args[1]); if (m) { st.out(m[2] + '\n'); st.done(0); return true; } } st.out(''); st.done(0); return true; }
  if ((nm === 'python' || nm === 'python3') && repo === 'python') { if (args[0] === '--version' || args[0] === '-V') { st.out('Python ' + c.spec.version + '\n'); st.done(0); return true; } if (args[0] === '-c' && args[1]) { const m = /print\((['"])(.*?)\1\)/.exec(args[1]); if (m) { st.out(m[2] + '\n'); st.done(0); return true; } } st.out(''); st.done(0); return true; }
  return false;
};
})(typeof window !== 'undefined' ? window : globalThis);
