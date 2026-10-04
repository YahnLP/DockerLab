/* dockercli2.js — docker volume / network / image / system / container et point d'entrée `docker` */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const { U, DockerError, CMDS } = NS;
const SUB = NS.dockerSub; const parseFlags = NS.dockerParseFlags; const { dErr, noCont, why, eachSeq, fmtList, HDR } = NS.dockerHelpers;

/* ------------------------------------------------ volume */
const VOL = {};
VOL.create = function (args, st) {
  const { f, rest, err } = parseFlags(args, ['driver|d:s', 'label:l', 'opt|o:l', 'name:s'], false, 'volume create'); if (err) { st.err(err + '\n'); return st.done(1); }
  const labels = {}; (f.label || []).forEach(l => { const i = l.indexOf('='); labels[i < 0 ? l : l.slice(0, i)] = i < 0 ? '' : l.slice(i + 1); });
  try { const v = st.lab.createVolume(rest[0] || f.name, { labels }); st.out(v.name + '\n'); why(st, 'docker volume create', ['Crée un volume géré par Docker (stocké dans /var/lib/docker/volumes sur l\'hôte).', 'Un volume survit à la suppression des conteneurs : c\'est ainsi qu\'on conserve des données (bases de données, fichiers envoyés…).', 'On l\'utilise avec -v nom_du_volume:/chemin/dans/le/conteneur.']); st.done(0); } catch (e) { dErr(st, e); st.done(1); }
};
VOL.ls = function (args, st) {
  const { f, err } = parseFlags(args, ['quiet|q:b', 'filter|f:l', 'format:s'], false, 'volume ls'); if (err) { st.err(err + '\n'); return st.done(1); }
  let l = st.lab.volumes.slice(); (f.filter || []).forEach(x => { const [k, v] = x.split('='); if (k === 'dangling') l = l.filter(vo => (!st.lab.containers.some(c => c.mounts.some(m => m.name === vo.name))) === (v === 'true')); if (k === 'name') l = l.filter(vo => vo.name.includes(v)); });
  const rows = l.map(v => ({ Driver: v.driver, Name: v.name, Mountpoint: v.mountpoint, Scope: 'local', Labels: '' }));
  st.out(fmtList(st, rows, { format: f.format, quiet: f.quiet }, [{ k: 'Driver' }, { k: 'Name' }], 'Name')); st.done(0);
};
VOL.rm = function (args, st) {
  const { f, rest, err } = parseFlags(args, ['force|f:b'], false, 'volume rm'); if (err) { st.err(err + '\n'); return st.done(1); }
  if (!rest.length) { st.err('docker: "volume rm" requires at least 1 argument.\nSee \'docker volume rm --help\'.\n'); return st.done(1); }
  let code = 0; rest.forEach(n => { try { st.lab.removeVolume(n); st.out(n + '\n'); } catch (e) { dErr(st, e); code = 1; } }); st.done(code);
};
VOL.inspect = function (args, st) {
  const { f, rest, err } = parseFlags(args, ['format|f:s'], false, 'volume inspect'); if (err) { st.err(err + '\n'); return st.done(1); }
  const out = []; let code = 0; rest.forEach(n => { const v = st.lab.getVolume(n); if (v) out.push(st.lab.inspectVolume(v)); else { st.err('Error response from daemon: get ' + n + ': no such volume\n'); code = 1; } });
  if (f.format) out.forEach(o => st.out(U.goTemplate(f.format, o) + '\n')); else st.out(JSON.stringify(out, null, 4) + '\n'); st.done(code);
};
function confirm(st, f, msg, go) {
  if (f.force) return go();
  const s = st.ctx.session; if (!s) return go();
  s.ask(msg + '\nAre you sure you want to continue? [y/N] ', ans => { if (/^y(es)?$/i.test(ans)) go(); else { st.out('Total reclaimed space: 0B\n'); st.done(0); } }, { print: st.out });
}
VOL.prune = function (args, st) {
  const { f, err } = parseFlags(args, ['force|f:b', 'all|a:b', 'filter:l'], false, 'volume prune'); if (err) { st.err(err + '\n'); return st.done(1); }
  confirm(st, f, 'WARNING! This will remove ' + (f.all ? 'all' : 'anonymous') + ' local volumes not used by at least one container.', () => {
    const del = st.lab.volumes.filter(v => (f.all || v.anonymous) && !st.lab.containers.some(c => c.mounts.some(m => m.name === v.name)));
    del.forEach(v => st.lab.removeVolume(v.name)); st.out((del.length ? 'Deleted Volumes:\n' + del.map(v => v.name).join('\n') + '\n\n' : '') + 'Total reclaimed space: 0B\n'); st.done(0);
  });
};

/* ------------------------------------------------ network */
const NET = {};
NET.create = function (args, st) {
  const { f, rest, err } = parseFlags(args, ['driver|d:s', 'subnet:s', 'gateway:s', 'internal:b', 'label:l', 'attachable:b', 'ipv6:b', 'opt|o:l', 'ip-range:s'], false, 'network create'); if (err) { st.err(err + '\n'); return st.done(1); }
  if (!rest.length) { st.err('docker: "network create" requires exactly 1 argument.\nSee \'docker network create --help\'.\n\nUsage:  docker network create [OPTIONS] NETWORK\n\nCreate a network\n'); return st.done(1); }
  try { const n = st.lab.createNetwork(rest[0], { driver: f.driver, subnet: f.subnet, gateway: f.gateway, internal: f.internal }); st.out(n.id + '\n'); why(st, 'docker network create', ['Crée un réseau virtuel (bridge) isolé : les conteneurs qui y sont connectés se voient entre eux, pas ceux des autres réseaux.', 'Sur un réseau créé par vous, Docker fournit un DNS interne : un conteneur peut joindre un autre par son NOM (ex. ping db).', 'Le réseau « bridge » par défaut n\'a pas cette résolution de noms : on n\'y joint les conteneurs que par adresse IP.']); st.done(0); } catch (e) { dErr(st, e); st.done(1); }
};
NET.ls = function (args, st) {
  const { f, err } = parseFlags(args, ['quiet|q:b', 'filter|f:l', 'format:s', 'no-trunc:b'], false, 'network ls'); if (err) { st.err(err + '\n'); return st.done(1); }
  let l = st.lab.networks.slice().sort((a, b) => a.name < b.name ? -1 : 1); (f.filter || []).forEach(x => { const [k, v] = x.split('='); if (k === 'name') l = l.filter(n => n.name.includes(v)); if (k === 'driver') l = l.filter(n => n.driver === v); });
  const rows = l.map(n => ({ ID: f['no-trunc'] ? n.id : n.id.slice(0, 12), Name: n.name, Driver: n.driver, Scope: n.scope, Internal: String(n.internal) }));
  st.out(fmtList(st, rows, { format: f.format, quiet: f.quiet }, [{ k: 'ID', h: 'NETWORK ID' }, { k: 'Name', h: 'NAME' }, { k: 'Driver' }, { k: 'Scope' }], 'ID')); st.done(0);
};
NET.rm = function (args, st) {
  if (!args.filter(a => a[0] !== '-').length) { st.err('docker: "network rm" requires at least 1 argument.\nSee \'docker network rm --help\'.\n'); return st.done(1); }
  let code = 0; args.filter(a => a[0] !== '-').forEach(n => { try { st.lab.removeNetwork(n); st.out(n + '\n'); } catch (e) { dErr(st, e); code = 1; } }); st.done(code);
};
NET.inspect = function (args, st) {
  const { f, rest, err } = parseFlags(args, ['format|f:s', 'verbose|v:b'], false, 'network inspect'); if (err) { st.err(err + '\n'); return st.done(1); }
  const out = []; let code = 0; rest.forEach(n => { const o = st.lab.getNetwork(n); if (o) out.push(st.lab.inspectNetwork(o)); else { st.err('Error response from daemon: network ' + n + ' not found\n'); code = 1; } });
  if (f.format) out.forEach(o => st.out(U.goTemplate(f.format, o) + '\n')); else st.out(JSON.stringify(out, null, 4) + '\n'); st.done(code);
};
NET.connect = function (args, st) {
  const { f, rest, err } = parseFlags(args, ['alias:l', 'ip:s'], false, 'network connect'); if (err) { st.err(err + '\n'); return st.done(1); }
  if (rest.length !== 2) { st.err('docker: "network connect" requires exactly 2 arguments.\nSee \'docker network connect --help\'.\n\nUsage:  docker network connect [OPTIONS] NETWORK CONTAINER\n\nConnect a container to a network\n'); return st.done(1); }
  try { const c = st.lab.getContainer(rest[1]); if (!c) throw noCont(rest[1]); st.lab.connectNetwork(rest[0], c, f.alias || []); why(st, 'docker network connect', ['Ajoute une interface réseau au conteneur sur le réseau indiqué (sans le redémarrer).', 'Un conteneur peut être connecté à plusieurs réseaux : c\'est la méthode pour qu\'un serveur web joigne une base de données tout en restant isolé du reste.']); st.done(0); } catch (e) { dErr(st, e); st.done(1); }
};
NET.disconnect = function (args, st) {
  const a = args.filter(x => x[0] !== '-'); if (a.length !== 2) { st.err('docker: "network disconnect" requires exactly 2 arguments.\nSee \'docker network disconnect --help\'.\n'); return st.done(1); }
  try { const c = st.lab.getContainer(a[1]); if (!c) throw noCont(a[1]); st.lab.disconnectNetwork(a[0], c); st.done(0); } catch (e) { dErr(st, e); st.done(1); }
};
NET.prune = function (args, st) {
  const { f, err } = parseFlags(args, ['force|f:b', 'filter:l'], false, 'network prune'); if (err) { st.err(err + '\n'); return st.done(1); }
  confirm(st, f, 'WARNING! This will remove all custom networks not used by at least one container.', () => { const del = st.lab.networks.filter(n => !n.builtin && !Object.keys(n.members).length && !st.lab.containers.some(c => c.nets[n.name])); del.forEach(n => st.lab.removeNetwork(n.name)); st.out((del.length ? 'Deleted Networks:\n' + del.map(n => n.name).join('\n') + '\n' : '')); st.done(0); });
};

/* ------------------------------------------------ prune / df */
function sub(map, name, args, st, prefix) {
  if (!name || name === '--help') { st.out('\nUsage:  docker ' + prefix + ' COMMAND\n\nCommands:\n' + Object.keys(map).map(k => '  ' + k.padEnd(10) + '').join('\n') + '\n'); return st.done(0); }
  const fn = map[name]; if (!fn) { st.err('docker: \'' + name + '\' is not a docker ' + prefix + ' command.\nSee \'docker ' + prefix + ' --help\'\n'); return st.done(1); }
  fn(args, st);
}
SUB.volume = (a, st) => sub(VOL, a[0] === 'list' ? 'ls' : a[0] === 'remove' ? 'rm' : a[0], a.slice(1), st, 'volume');
SUB.network = (a, st) => sub(NET, a[0] === 'list' ? 'ls' : a[0] === 'remove' ? 'rm' : a[0], a.slice(1), st, 'network');
function pruneContainers(st) { const del = st.lab.containers.filter(c => !c.running && c.state.status !== 'restarting'); del.forEach(c => st.lab.removeContainer(c, {})); return del; }
function pruneImages(st, all) {
  const lab = st.lab; const used = new Set(lab.containers.map(c => c.imageId)); const out = [];
  lab.images.slice().forEach(i => { if (used.has(i.id)) return; if (i.refs.length && !all) return; try { lab.removeImage(i.id, true).forEach(l => out.push(l)); } catch (e) { } });
  return out;
}
const IMG = {
  ls: SUB.images, list: SUB.images, pull: SUB.pull, rm: SUB.rmi, remove: SUB.rmi, tag: SUB.tag, inspect: SUB.inspect,
  prune(args, st) { const { f } = parseFlags(args, ['force|f:b', 'all|a:b', 'filter:l'], false, 'image prune'); confirm(st, f, 'WARNING! This will remove ' + (f.all ? 'all images without at least one container associated to them.' : 'all dangling images.'), () => { const o = pruneImages(st, !!f.all); st.out((o.length ? 'Deleted Images:\n' + o.join('\n') + '\n\n' : '') + 'Total reclaimed space: 0B\n'); st.done(0); }); },
  history(args, st) { return SUB.history(args, st); },
  build(args, st) { return SUB.build(args, st); },
};
SUB.image = (a, st) => sub(IMG, a[0], a.slice(1), st, 'image');
const CON = { ls: SUB.ps, list: SUB.ps, ps: SUB.ps, rm: SUB.rm, remove: SUB.rm, stop: SUB.stop, start: SUB.start, restart: SUB.restart, kill: SUB.kill, logs: SUB.logs, exec: SUB.exec, inspect: SUB.inspect, run: SUB.run, create: SUB.create, top: SUB.top, port: SUB.port, stats: SUB.stats, rename: SUB.rename, pause: SUB.pause, unpause: SUB.unpause, cp: SUB.cp,
  prune(args, st) { const { f } = parseFlags(args, ['force|f:b', 'filter:l'], false, 'container prune'); confirm(st, f, 'WARNING! This will remove all stopped containers.', () => { const d = pruneContainers(st); st.out((d.length ? 'Deleted Containers:\n' + d.map(c => c.id).join('\n') + '\n\n' : '') + 'Total reclaimed space: 0B\n'); st.done(0); }); } };
SUB.container = (a, st) => sub(CON, a[0], a.slice(1), st, 'container');
const SYS = {
  df(args, st) { const lab = st.lab; const used = new Set(lab.containers.map(c => c.imageId)); const tot = lab.images.reduce((a, i) => a + i.size, 0); const rec = lab.images.filter(i => !used.has(i.id)).reduce((a, i) => a + i.size, 0); const act = lab.images.filter(i => used.has(i.id)).length;
    st.out(U.table([['TYPE', 'TOTAL', 'ACTIVE', 'SIZE', 'RECLAIMABLE'], ['Images', String(lab.images.length), String(act), U.humanSize(tot), U.humanSize(rec) + ' (' + (tot ? Math.round(rec / tot * 100) : 0) + '%)'], ['Containers', String(lab.containers.length), String(lab.containers.filter(c => c.running).length), '0B', '0B (0%)'], ['Local Volumes', String(lab.volumes.length), String(lab.volumes.filter(v => lab.containers.some(c => c.mounts.some(m => m.name === v.name))).length), '0B', '0B'], ['Build Cache', '0', '0', '0B', '0B']])); st.done(0); },
  prune(args, st) { const { f } = parseFlags(args, ['force|f:b', 'all|a:b', 'volumes:b', 'filter:l'], false, 'system prune'); confirm(st, f, 'WARNING! This will remove:\n  - all stopped containers\n  - all networks not used by at least one container\n' + (f.volumes ? '  - all anonymous volumes not used by at least one container\n' : '') + '  - all ' + (f.all ? 'images without at least one container associated to them' : 'dangling images') + '\n  - unused build cache\n', () => {
    const out = []; const dc = pruneContainers(st); if (dc.length) out.push('Deleted Containers:\n' + dc.map(c => c.id).join('\n') + '\n');
    const dn = st.lab.networks.filter(n => !n.builtin && !Object.keys(n.members).length && !st.lab.containers.some(c => c.nets[n.name])); dn.forEach(n => st.lab.removeNetwork(n.name)); if (dn.length) out.push('Deleted Networks:\n' + dn.map(n => n.name).join('\n') + '\n');
    if (f.volumes) { const dv = st.lab.volumes.filter(v => v.anonymous && !st.lab.containers.some(c => c.mounts.some(m => m.name === v.name))); dv.forEach(v => st.lab.removeVolume(v.name)); if (dv.length) out.push('Deleted Volumes:\n' + dv.map(v => v.name).join('\n') + '\n'); }
    const di = pruneImages(st, !!f.all); if (di.length) out.push('Deleted Images:\n' + di.join('\n') + '\n'); st.out(out.join('\n') + (out.length ? '\n' : '') + 'Total reclaimed space: 0B\n'); st.done(0); }); },
  info: SUB.info,
};
SUB.system = (a, st) => sub(SYS, a[0], a.slice(1), st, 'system');

const HELP = '\nUsage:  docker [OPTIONS] COMMAND\n\nA self-sufficient runtime for containers\n\nCommon Commands:\n  run         Create and run a new container from an image\n  exec        Execute a command in a running container\n  ps          List containers\n  build       Build an image from a Dockerfile\n  pull        Download an image from a registry\n  images      List images\n  logs        Fetch the logs of a container\n  compose     Docker Compose\n\nManagement Commands:\n  container   Manage containers\n  image       Manage images\n  network     Manage networks\n  system      Manage Docker\n  volume      Manage volumes\n\nCommands:\n  create      Create a new container\n  cp          Copy files/folders between a container and the local filesystem\n  inspect     Return low-level information on Docker objects\n  kill        Kill one or more running containers\n  pause       Pause all processes within one or more containers\n  port        List port mappings or a specific mapping for the container\n  rename      Rename a container\n  restart     Restart one or more containers\n  rm          Remove one or more containers\n  rmi         Remove one or more images\n  start       Start one or more stopped containers\n  stats       Display a live stream of container(s) resource usage statistics\n  stop        Stop one or more running containers\n  tag         Create a tag TARGET_IMAGE that refers to SOURCE_IMAGE\n  top         Display the running processes of a container\n  unpause     Unpause all processes within one or more containers\n  version     Show the Docker version information\n\nRun \'docker COMMAND --help\' for more information on a command.\n\nFor more help on how to use Docker, head to https://docs.docker.com/go/guides/\n';
CMDS.docker = {
  host: true,
  f(args, st) {
    let i = 0; while (args[i] && args[i][0] === '-' && !/^(-v|--version|-h|--help)$/.test(args[i])) { if (/^(-H|--host|--context|-c|-l|--log-level|--config)$/.test(args[i])) i++; i++; }
    const name = args[i]; const rest = args.slice(i + 1);
    if (args[i] === '--version' || args[i] === '-v') { st.out('Docker version 27.3.1, build ce12230\n'); return st.done(0); }
    if (!name || name === '--help' || name === '-h' || name === 'help') { st.out(HELP); return st.done(0); }
    if (rest.includes('--help') && SUB[name]) { st.out('\nUsage:  docker ' + name + ' [OPTIONS]\n\nRun \'docker --help\' for the list of options. (aide détaillée non simulée)\n'); return st.done(0); }
    const fn = SUB[name] || (name === 'ls' ? null : null);
    if (name === 'builder') { st.err('[Docker Lab] « docker ' + name + ' » sera disponible dans une prochaine phase du simulateur (Dockerfile et build).\n'); return st.done(1); }
    if (name === 'compose' || name === 'docker-compose') { st.err('[Docker Lab] « docker compose » sera disponible dans une prochaine phase du simulateur.\n'); return st.done(1); }
    if (name === 'login' || name === 'logout' || name === 'push' || name === 'search') { st.err('[Docker Lab] « docker ' + name + ' » n\'est pas simulé (le registre est fictif et en lecture seule).\n'); return st.done(1); }
    if (!fn) { st.err('docker: \'' + name + '\' is not a docker command.\nSee \'docker --help\'\n'); return st.done(1); }
    st.lab.lastWhy = null; st.lab.lastCmd = 'docker ' + args.join(' ');
    fn(rest, st);
  },
};
CMDS.help = { host: true, f(a, st) { st.out('Docker Lab — terminal de l\'hôte Docker\n\nCommandes docker : run, ps, images, pull, stop, start, restart, kill, rm, rmi, logs, exec, inspect, cp, top, stats, port, rename, pause, unpause, tag, create,\n                   volume (create/ls/rm/inspect/prune), network (create/ls/rm/inspect/connect/disconnect/prune), container/image/system (prune, df)…\nCommandes de l\'hôte : ls, cat, echo, cd, pwd, mkdir, touch, rm, cp, mv, head, tail, grep, wc, curl, nano, clear, env…\nTab complète, ↑/↓ naviguent dans l\'historique, Ctrl+C interrompt, Ctrl+L efface.\n'); st.done(0); } };
CMDS.history = { host: true, f(a, st) { const h = (st.ctx.session && st.ctx.session.history) || []; st.out(h.map((l, i) => String(i + 1).padStart(5) + '  ' + l).join('\n') + (h.length ? '\n' : '')); st.done(0); } };
})(typeof window !== 'undefined' ? window : globalThis);
