/* engine.js — moteur Docker simulé : images, conteneurs, réseaux, volumes, processus, DNS et flux HTTP. Aucune dépendance au DOM. */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const { U, VFS } = NS;

class DockerError extends Error { constructor(msg, o) { super(msg); this.name = 'DockerError'; if (o) Object.assign(this, o); } }
NS.DockerError = DockerError;

const ADJ = ['admiring', 'agitated', 'amazing', 'angry', 'awesome', 'beautiful', 'blissful', 'bold', 'boring', 'brave', 'busy', 'charming', 'clever', 'cool', 'compassionate', 'competent', 'condescending', 'confident', 'cranky', 'crazy', 'dazzling', 'determined', 'distracted', 'dreamy', 'eager', 'ecstatic', 'elastic', 'elated', 'elegant', 'eloquent', 'epic', 'exciting', 'fervent', 'festive', 'flamboyant', 'focused', 'friendly', 'frosty', 'funny', 'gallant', 'gifted', 'goofy', 'gracious', 'happy', 'hardcore', 'heuristic', 'hopeful', 'hungry', 'infallible', 'inspiring', 'jolly', 'jovial', 'keen', 'kind', 'laughing', 'loving', 'lucid', 'magical', 'modest', 'musing', 'mystifying', 'naughty', 'nervous', 'nice', 'nifty', 'nostalgic', 'objective', 'optimistic', 'peaceful', 'pedantic', 'pensive', 'practical', 'priceless', 'quirky', 'quizzical', 'relaxed', 'reverent', 'romantic', 'sad', 'serene', 'sharp', 'silly', 'sleepy', 'stoic', 'strange', 'stupefied', 'suspicious', 'sweet', 'tender', 'thirsty', 'trusting', 'unruffled', 'upbeat', 'vibrant', 'vigilant', 'vigorous', 'wizardly', 'wonderful', 'xenodochial', 'youthful', 'zealous', 'zen'];
const SUR = ['albattani', 'allen', 'almeida', 'archimedes', 'ardinghelli', 'aryabhata', 'austin', 'babbage', 'banach', 'bardeen', 'bartik', 'bassi', 'beaver', 'bell', 'benz', 'bhabha', 'blackburn', 'bohr', 'booth', 'borg', 'bose', 'boyd', 'brahmagupta', 'brattain', 'brown', 'carson', 'chandrasekhar', 'colden', 'cori', 'cray', 'curie', 'darwin', 'davinci', 'dijkstra', 'dubinsky', 'easley', 'einstein', 'elbakyan', 'elgamal', 'elion', 'ellis', 'engelbart', 'euclid', 'euler', 'faraday', 'feistel', 'fermat', 'fermi', 'feynman', 'franklin', 'galileo', 'gates', 'germain', 'goldberg', 'goldstine', 'goodall', 'gould', 'greider', 'grothendieck', 'haibt', 'hamilton', 'haslett', 'hawking', 'heisenberg', 'hermann', 'hertz', 'hodgkin', 'hoover', 'hopper', 'hugle', 'hypatia', 'jackson', 'jang', 'jennings', 'jepsen', 'johnson', 'joliot', 'jones', 'kalam', 'kapitsa', 'kare', 'keldysh', 'keller', 'kepler', 'khorana', 'kilby', 'kirch', 'knuth', 'kowalevski', 'lalande', 'lamarr', 'lamport', 'leakey', 'leavitt', 'lederberg', 'lehmann', 'lewin', 'lichterman', 'liskov', 'lovelace', 'lumiere', 'mahavira', 'margulis', 'matsumoto', 'maxwell', 'mayer', 'mccarthy', 'mcclintock', 'mclean', 'mcnulty', 'meitner', 'meninsky', 'mestorf', 'mirzakhani', 'montalcini', 'moore', 'morse', 'murdock', 'moser', 'napier', 'nash', 'neumann', 'newton', 'nightingale', 'nobel', 'noether', 'northcutt', 'noyce', 'panini', 'pare', 'pascal', 'pasteur', 'payne', 'perlman', 'pike', 'poincare', 'poitras', 'proskuriakova', 'ptolemy', 'raman', 'ramanujan', 'ride', 'ritchie', 'rhodes', 'robinson', 'roentgen', 'rosalind', 'rubin', 'saha', 'sammet', 'sanderson', 'satoshi', 'shamir', 'shannon', 'shaw', 'shirley', 'shockley', 'shtern', 'sinoussi', 'snyder', 'solomon', 'spence', 'stonebraker', 'sutherland', 'swanson', 'swartz', 'swirles', 'taussig', 'tesla', 'thompson', 'torvalds', 'turing', 'varahamihira', 'vaughan', 'villani', 'visvesvaraya', 'volhard', 'wescoff', 'wilbur', 'wiles', 'williams', 'williamson', 'wilson', 'wing', 'wozniak', 'wright', 'wu', 'yalow', 'yonath', 'zhukovsky'];

const HOST_RESERVED = { 22: 'sshd', 631: 'cupsd' };

class Container {
  constructor(lab, o) { Object.assign(this, o); this.lab = lab; }
  get shortId() { return this.id.slice(0, 12); }
  envMap() { const m = {}; this.config.env.forEach(e => { const i = e.indexOf('='); m[i < 0 ? e : e.slice(0, i)] = i < 0 ? '' : e.slice(i + 1); }); return m; }
  effective() { let eff = this.config.entrypoint.concat(this.config.cmd); if (eff[0] && /(^|\/)docker-entrypoint\.sh$/.test(eff[0])) eff = eff.slice(1); return eff; }
  displayCmd() { return this.config.entrypoint.concat(this.config.cmd).join(' '); }
  get running() { return this.state.status === 'running' || this.state.status === 'paused'; }
  netList() { return Object.keys(this.nets); }
  primaryIp() { const n = Object.values(this.nets).find(x => x.ip); return n ? n.ip : ''; }
}

class Lab {
  constructor(opts) {
    opts = opts || {};
    this.clock = new NS.Clock(); this.clock.onError = e => { if (typeof console !== 'undefined') console.error(e); };
    this.epoch = opts.epoch || Date.now();
    this.seed = opts.seed === undefined ? (Date.now() & 0x7fffffff) : opts.seed;
    this.rng = U.rng(this.seed);
    this.hostname = 'dockerlab'; this.user = 'student';
    this.hostFs = new VFS(); this.hostFs.home = '/home/student';
    ['/home/student', '/tmp', '/etc', '/var/log', '/usr/bin'].forEach(d => this.hostFs.mkdirp(d));
    this.hostFs.write('/etc/os-release', 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\n');
    this.hostFs.write('/etc/hostname', this.hostname + '\n');
    this.images = []; this.containers = []; this.networks = []; this.volumes = []; this.events = [];
    this.listeners = []; this.turbo = 0; this.nextEph = 32768; this.hits = 0; this.sessions = []; this.journal = [];
    this._initNetworks();
  }
  /* ------------------------------------------------ temps, événements, notifications */
  wall() { return this.epoch + this.clock.now; }
  hex(n) { let o = ''; while (o.length < n) o += Math.floor(this.rng() * 16).toString(16); return o; }
  on(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(x => x !== fn); }; }
  changed() { if (this._pend) return; this._pend = true; this.clock.schedule(0, () => { this._pend = false; this.listeners.forEach(f => { try { f(); } catch (e) { } }); }); }
  emit(type, action, id, attrs) { this.events.push({ t: this.wall(), type, action, id, attrs: attrs || {} }); if (this.events.length > 500) this.events.shift(); this.changed(); }
  /* attend ms millisecondes simulées (accélérées dans l'interface par `turbo`) */
  wait(ms, fn) { this.turbo++; return this.clock.schedule(ms, () => { this.turbo = Math.max(0, this.turbo - 1); fn(); }); }

  /* ------------------------------------------------ images */
  parseRef(ref) {
    let r = String(ref).replace(/^docker\.io\//, '').replace(/^library\//, '').replace(/^index\.docker\.io\//, '');
    let tag = null; const slash = r.lastIndexOf('/'); const colon = r.lastIndexOf(':');
    if (colon > slash) { tag = r.slice(colon + 1); r = r.slice(0, colon); }
    return { repo: r, tag: tag || 'latest', explicit: !!tag };
  }
  validRef(ref) { return /^[a-z0-9]+([._-][a-z0-9]+)*(\/[a-z0-9]+([._-][a-z0-9]+)*)*(:[\w][\w.-]{0,127})?$/.test(String(ref).replace(/^(docker\.io|index\.docker\.io)\//, '')); }
  findImage(ref) {
    const p = this.parseRef(ref);
    let im = this.images.find(i => i.refs.some(x => x.repo === p.repo && x.tag === p.tag));
    if (im) return im;
    const idr = String(ref).replace(/^sha256:/, '');
    if (/^[0-9a-f]{2,64}$/.test(idr)) { const m = this.images.filter(i => i.id.startsWith(idr)); if (m.length === 1) return m[0]; }
    return null;
  }
  _imageFromSpec(spec) {
    const fs = NS.baseFs(spec.base); const beh = NS.BEHAVIORS[spec.behavior];
    if (beh && beh.seedFs) beh.seedFs(fs, spec);
    spec.config.volumes.forEach(v => fs.mkdirp(v));
    return { id: spec.id, refs: [], created: -spec.ageDays * 86400000, size: spec.size, spec, config: JSON.parse(JSON.stringify(spec.config)), fs: fs.root, layers: spec.layerIds.map((id, i) => ({ id, size: spec.layerSizes[i] })), digest: spec.digest, os: spec.base, history: [] };
  }
  /* tire une image ; onLine(texte) reçoit les lignes ; cb(err, {image, downloaded}) */
  pull(ref, onLine, cb, opts) {
    opts = opts || {};
    if (!this.validRef(ref)) return cb(new DockerError('invalid reference format' + (/[A-Z]/.test(ref) ? ': repository name (library/' + ref.split(':')[0] + ') must be lowercase' : ''), { raw: true }));
    const p = this.parseRef(ref); const disp = p.repo.indexOf('/') < 0 ? 'library/' + p.repo : p.repo;
    const spec = NS.registryLookup(p.repo, p.tag);
    if (!spec) {
      if (!NS.REGISTRY[p.repo]) return this.wait(300, () => cb(new DockerError("pull access denied for " + p.repo + ", repository does not exist or may require 'docker login': denied: requested access to the resource is denied")));
      return this.wait(300, () => cb(new DockerError('manifest for ' + p.repo + ':' + p.tag + ' not found: manifest unknown: manifest unknown')));
    }
    if (!p.explicit && !opts.noDefault) onLine('Using default tag: ' + p.tag + '\n');
    onLine(p.tag + ': Pulling from ' + disp + '\n');
    let img = this.images.find(i => i.id === spec.id);
    const had = img && img.refs.some(x => x.repo === p.repo && x.tag === p.tag);
    const known = new Set(); this.images.forEach(i => i.layers.forEach(l => known.add(l.id)));
    let t = 200;
    spec.layerIds.forEach((id, i) => {
      const exists = known.has(id) || img;
      this.wait(t, () => onLine(id + ': ' + (exists ? 'Already exists' : 'Pull complete') + '\n'));
      t += exists ? 20 : 150 + Math.round(spec.layerSizes[i] / 400000);
    });
    this.wait(t + 100, () => {
      onLine('Digest: ' + spec.digest + '\n');
      if (!img) { img = this._imageFromSpec(spec); this.images.push(img); }
      if (!had) { img.refs.push({ repo: p.repo, tag: p.tag }); onLine('Status: Downloaded newer image for ' + p.repo + ':' + p.tag + '\n'); } else onLine('Status: Image is up to date for ' + p.repo + ':' + p.tag + '\n');
      onLine('docker.io/' + disp + ':' + p.tag + '\n');
      this.emit('image', 'pull', 'docker.io/' + disp + ':' + p.tag, { name: 'docker.io/' + disp });
      cb(null, { image: img, downloaded: !had });
    });
  }
  imageName(img, i) { const r = img.refs[i || 0]; return r ? r.repo + ':' + r.tag : img.id.slice(0, 12); }
  removeImage(ref, force) {
    const img = this.findImage(ref); if (!img) throw new DockerError('No such image: ' + ref);
    const p = this.parseRef(ref);
    const idLike = /^(sha256:)?[0-9a-f]{12,64}$/.test(ref) && !img.refs.some(x => x.repo === p.repo && x.tag === p.tag);
    const users = this.containers.filter(c => c.imageId === img.id);
    const out = [];
    const sameRef = c => { const q = this.parseRef(c.imageRef); return q.repo === p.repo && q.tag === p.tag; };
    const drop = () => {
      this.images = this.images.filter(i => i !== img);
      out.push('Deleted: sha256:' + img.id);
      const keep = new Set(); this.images.forEach(i => i.layers.forEach(l => keep.add(l.id)));
      img.layers.slice().reverse().forEach(l => { if (!keep.has(l.id)) out.push('Deleted: sha256:' + U.hexOf('full' + l.id, 64)); });
      this.emit('image', 'delete', 'sha256:' + img.id, {});
    };
    if (!idLike) {
      const name = p.repo + ':' + p.tag;
      if (img.refs.length > 1) {
        const u = users.find(sameRef);
        if (u && !force) throw new DockerError('conflict: unable to remove repository reference "' + name + '" (must force) - container ' + u.shortId + ' is using its referenced image ' + img.id.slice(0, 12));
        img.refs = img.refs.filter(x => !(x.repo === p.repo && x.tag === p.tag)); out.push('Untagged: ' + name); this.emit('image', 'untag', 'sha256:' + img.id, {}); return out;
      }
      if (users.length && !force) throw new DockerError('conflict: unable to remove repository reference "' + name + '" (must force) - container ' + users[0].shortId + ' is using its referenced image ' + img.id.slice(0, 12));
      img.refs = []; out.push('Untagged: ' + name); drop(); return out;
    }
    if (users.length && !force) throw new DockerError('conflict: unable to delete ' + img.id.slice(0, 12) + ' (must be forced) - image is being used by ' + (users[0].running ? 'running' : 'stopped') + ' container ' + users[0].shortId);
    if (img.refs.length > 1 && !force) throw new DockerError('conflict: unable to delete ' + img.id.slice(0, 12) + ' (must be forced) - image is referenced in multiple repositories');
    img.refs.forEach(x => out.push('Untagged: ' + x.repo + ':' + x.tag)); img.refs = []; drop(); return out;
  }
  tagImage(src, dst) {
    const img = this.findImage(src); if (!img) throw new DockerError('No such image: ' + src);
    if (!this.validRef(dst)) throw new DockerError('invalid reference format', { raw: true });
    const p = this.parseRef(dst);
    this.images.forEach(i => { i.refs = i.refs.filter(x => !(x.repo === p.repo && x.tag === p.tag)); });
    img.refs.push({ repo: p.repo, tag: p.tag }); this.emit('image', 'tag', 'sha256:' + img.id, { name: p.repo + ':' + p.tag }); return img;
  }

  /* ------------------------------------------------ réseaux */
  _initNetworks() {
    const mk = (name, driver, subnet, gw) => ({ id: this.hex(64), name, driver, subnet, gateway: gw, builtin: true, created: 0, members: {}, used: new Set(), internal: false, labels: {}, scope: 'local' });
    this.networks.push(mk('bridge', 'bridge', '172.17.0.0/16', '172.17.0.1'), mk('host', 'host', '', ''), mk('none', 'null', '', ''));
  }
  getNetwork(ref) {
    let n = this.networks.find(x => x.name === ref) || this.networks.find(x => x.id === ref);
    if (!n && ref && ref.length >= 3) { const m = this.networks.filter(x => x.id.startsWith(ref)); if (m.length === 1) n = m[0]; }
    return n || null;
  }
  createNetwork(name, o) {
    o = o || {};
    if (this.networks.some(n => n.name === name)) throw new DockerError('network with name ' + name + ' already exists');
    if (o.driver && ['bridge'].indexOf(o.driver) < 0) throw new DockerError('plugin "' + o.driver + '" not found');
    let subnet = o.subnet, gw = o.gateway;
    if (!subnet) {
      const usedS = new Set(this.networks.map(n => n.subnet));
      for (let i = 18; i <= 31 && !subnet; i++) { const s = '172.' + i + '.0.0/16'; if (!usedS.has(s)) subnet = s; }
      if (!subnet) for (let i = 0; i < 256 && !subnet; i += 16) { const s = '192.168.' + i + '.0/20'; if (!usedS.has(s)) subnet = s; }
      if (!subnet) throw new DockerError('all predefined address pools have been fully subnetted');
    } else if (!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(subnet)) throw new DockerError('invalid CIDR address: ' + subnet);
    else if (this.networks.some(n => n.subnet === subnet)) throw new DockerError('invalid pool request: Pool overlaps with other one on this address space');
    if (!gw) { const b = subnet.split('/')[0].split('.').map(Number); b[3] += 1; gw = b.join('.'); }
    const n = { id: this.hex(64), name, driver: 'bridge', subnet, gateway: gw, builtin: false, created: this.clock.now, members: {}, used: new Set(), internal: !!o.internal, labels: o.labels || {}, scope: 'local' };
    this.networks.push(n); this.emit('network', 'create', n.id, { name, type: 'bridge' }); return n;
  }
  removeNetwork(ref) {
    const n = this.getNetwork(ref); if (!n) throw new DockerError('network ' + ref + ' not found', { code: 'notfound' });
    if (n.builtin) throw new DockerError(n.name + ' is a pre-defined network and cannot be removed');
    if (Object.keys(n.members).length) throw new DockerError('error while removing network: network ' + n.name + ' id ' + n.id + ' has active endpoints');
    this.networks = this.networks.filter(x => x !== n); this.emit('network', 'destroy', n.id, { name: n.name, type: 'bridge' });
  }
  _allocIp(n) {
    const base = n.subnet.split('/')[0].split('.').map(Number); const bits = Number(n.subnet.split('/')[1]); const max = Math.min(Math.pow(2, 32 - bits) - 2, 65000);
    for (let k = 2; k <= max; k++) { if (!n.used.has(k)) { n.used.add(k); const b = base.slice(); let v = ((b[2] << 8) | b[3]) + k; b[3] = v & 255; b[2] = (v >> 8) & 255; return b.join('.'); } }
    throw new DockerError('no available IPv4 addresses on this network\'s address pools: ' + n.name + ' (' + n.id + ')');
  }
  _freeIp(n, ip) { const b = n.subnet.split('/')[0].split('.').map(Number); const p = ip.split('.').map(Number); n.used.delete(((p[2] << 8) | p[3]) - ((b[2] << 8) | b[3])); }
  _attach(c, n, aliases) {
    if (c.nets[n.name] && (c.nets[n.name].ip || n.driver !== 'bridge')) return;
    const ep = { netId: n.id, aliases: aliases || [], ip: '', mac: '', gateway: '', endpointId: this.hex(64) };
    if (n.driver === 'bridge') { ep.ip = this._allocIp(n); ep.gateway = n.gateway; ep.mac = '02:42:' + ep.ip.split('.').map(x => ('0' + Number(x).toString(16)).slice(-2)).join(':'); n.members[c.id] = ep; }
    c.nets[n.name] = ep;
  }
  _detach(c, n) { const ep = c.nets[n.name]; if (!ep) return; if (ep.ip) this._freeIp(n, ep.ip); delete n.members[c.id]; ep.ip = ''; ep.mac = ''; ep.gateway = ''; }
  connectNetwork(netRef, c, aliases) {
    const n = this.getNetwork(netRef); if (!n) throw new DockerError('network ' + netRef + ' not found');
    if (c.nets[n.name] && c.nets[n.name].netId) { if (c.running || true) throw new DockerError('endpoint with name ' + c.name + ' already exists in network ' + n.name); }
    if (c.running) this._attach(c, n, aliases); else c.nets[n.name] = { netId: n.id, aliases: aliases || [], ip: '', mac: '', gateway: '', endpointId: this.hex(64) };
    this.emit('network', 'connect', n.id, { container: c.id, name: n.name, type: n.driver }); return n;
  }
  disconnectNetwork(netRef, c) {
    const n = this.getNetwork(netRef); if (!n) throw new DockerError('network ' + netRef + ' not found');
    if (!c.nets[n.name]) throw new DockerError('container ' + c.id + ' is not connected to network ' + n.name);
    this._detach(c, n); delete c.nets[n.name]; this.emit('network', 'disconnect', n.id, { container: c.id, name: n.name, type: n.driver });
  }

  /* ------------------------------------------------ volumes */
  getVolume(name) { return this.volumes.find(v => v.name === name) || null; }
  createVolume(name, o) {
    o = o || {}; name = name || this.hex(64);
    const ex = this.getVolume(name); if (ex) return ex;
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(name)) throw new DockerError('create ' + name + ': "' + name + '" includes invalid characters for a local volume name, only "[a-zA-Z0-9][a-zA-Z0-9_.-]" are allowed. If you intended to pass a host directory, use absolute path');
    const v = { name, driver: 'local', created: this.clock.now, labels: o.labels || {}, vfs: new VFS(), anonymous: !!o.anonymous, mountpoint: '/var/lib/docker/volumes/' + name + '/_data', seeded: false };
    this.volumes.push(v); this.emit('volume', 'create', name, { driver: 'local' }); return v;
  }
  removeVolume(name) {
    const v = this.getVolume(name); if (!v) throw new DockerError('get ' + name + ': no such volume', { code: 'notfound' });
    const u = this.containers.find(c => c.mounts.some(m => m.type === 'volume' && m.name === name));
    if (u) throw new DockerError('remove ' + name + ': volume is in use - [' + u.id + ']');
    this.volumes = this.volumes.filter(x => x !== v); this.emit('volume', 'destroy', name, { driver: 'local' });
  }

  /* ------------------------------------------------ conteneurs : création */
  genName() { for (let k = 0; k < 200; k++) { const n = ADJ[Math.floor(this.rng() * ADJ.length)] + '_' + SUR[Math.floor(this.rng() * SUR.length)]; if (!this.containers.some(c => c.name === n)) return n; } return 'c_' + this.hex(6); }
  getContainer(ref) {
    const r = String(ref).replace(/^\//, '');
    let c = this.containers.find(x => x.name === r); if (c) return c;
    c = this.containers.find(x => x.id === r); if (c) return c;
    if (/^[0-9a-f]+$/.test(r)) { const m = this.containers.filter(x => x.id.startsWith(r)); if (m.length === 1) return m[0]; if (m.length > 1) throw new DockerError('Multiple IDs found with provided prefix: ' + r); }
    return null;
  }
  parsePort(s) {
    const bad = () => new DockerError('invalid containerPort: ' + String(s).split(/[:/]/).pop(), { raw: true, syntax: true });
    let proto = 'tcp'; let body = String(s); const pm = /\/(tcp|udp|sctp)$/.exec(body); if (pm) { proto = pm[1]; body = body.slice(0, -pm[0].length); }
    let ip = ''; const m6 = /^\[([^\]]+)\]:(.*)$/.exec(body); if (m6) { ip = '[' + m6[1] + ']'; body = m6[2]; }
    const parts = body.split(':');
    if (parts.length > 3 || (parts.length === 3 && ip)) throw bad();
    let hp = 0, cp;
    if (parts.length === 3) { ip = parts[0]; hp = parts[1]; cp = parts[2]; } else if (parts.length === 2) { hp = parts[0]; cp = parts[1]; } else cp = parts[0];
    if (!/^\d+$/.test(cp)) throw bad(); if (hp !== 0 && hp !== '' && !/^\d+$/.test(hp)) throw new DockerError('invalid hostPort: ' + hp, { raw: true, syntax: true });
    cp = Number(cp); hp = hp === '' ? 0 : Number(hp);
    if (cp < 1 || cp > 65535) throw new DockerError('invalid port specification: "' + cp + '"', { raw: true, syntax: true });
    if (hp > 65535) throw new DockerError('invalid port specification: "' + hp + '"', { raw: true, syntax: true });
    return { ip, hostPort: hp, port: cp, proto };
  }
  createContainer(o) {
    const img = o.imageObj || this.findImage(o.image); if (!img) throw new DockerError('No such image: ' + o.image);
    const name = o.name || this.genName();
    if (o.name) { if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(o.name)) throw new DockerError('Invalid container name (' + o.name + '), only [a-zA-Z0-9][a-zA-Z0-9_.-] are allowed'); const ex = this.containers.find(x => x.name === o.name); if (ex) throw new DockerError('Conflict. The container name "/' + o.name + '" is already in use by container "' + ex.id + '". You have to remove (or rename) that container to be able to reuse that name.', { code: 'conflict' }); }
    const netName = o.network || 'bridge'; const net = this.getNetwork(netName);
    if (!net) throw new DockerError('network ' + netName + ' not found');
    const id = this.hex(64);
    const cfg = JSON.parse(JSON.stringify(img.config));
    const env = (cfg.env || []).slice(); (o.env || []).forEach(e => { const k = e.split('=')[0]; const hasEq = e.indexOf('=') >= 0; const i = env.findIndex(x => x.split('=')[0] === k); const val = hasEq ? e : (o.hostEnv && o.hostEnv[k] !== undefined ? k + '=' + o.hostEnv[k] : null); if (val === null) return; if (i >= 0) env[i] = val; else env.push(val); });
    const hostname = o.hostname || id.slice(0, 12);
    env.push('HOSTNAME=' + hostname);
    const config = { entrypoint: o.entrypoint !== undefined && o.entrypoint !== null ? o.entrypoint : cfg.entrypoint, cmd: o.cmd && o.cmd.length ? o.cmd : (o.entrypoint !== undefined && o.entrypoint !== null ? [] : cfg.cmd), env, exposed: cfg.exposed, workdir: o.workdir || cfg.workdir || '', user: o.user || '', tty: !!o.tty, openStdin: !!o.openStdin, hostname, labels: o.labels || {}, stopSignal: cfg.stopSignal, imageCmd: cfg.cmd, volumes: cfg.volumes };
    if (o.entrypoint !== undefined && o.entrypoint !== null && !(o.cmd && o.cmd.length)) config.cmd = [];
    const ports = (o.ports || []).slice();
    const c = new Container(this, {
      id, name, imageId: img.id, imageRef: o.image, spec: img.spec, config, created: this.clock.now,
      host: { ports, publishAll: !!o.publishAll, restart: o.restart || { name: 'no', max: 0 }, autoRemove: !!o.autoRemove, network: netName, binds: [] },
      state: { status: 'created', exitCode: 0, startedAt: null, finishedAt: null, error: '', pid: 0, restartCount: 0, oomKilled: false },
      nets: {}, logs: [], mounts: [], fs: new VFS(VFS.clone(img.fs)), listen: [], timers: [], runToken: 0, subs: [], hits: 0, redis: null, procs: [], manualStop: false, pkgs: Object.assign({}, img.pkgs || {}),
    });
    c.fs.home = img.os === 'scratch' ? '/' : '/root';
    this._mounts(c, img, o.mounts || []);
    this.containers.push(c);
    if (net.driver === 'bridge') c.nets[net.name] = { netId: net.id, aliases: o.aliases || [], ip: '', mac: '', gateway: '', endpointId: this.hex(64) };
    else if (net.driver === 'host') c.nets.host = { netId: net.id, aliases: [], ip: '', mac: '', gateway: '', endpointId: this.hex(64) };
    else c.nets.none = { netId: net.id, aliases: [], ip: '', mac: '', gateway: '', endpointId: this.hex(64) };
    this.emit('container', 'create', id, { image: o.image, name });
    return c;
  }
  /* applique les montages demandés (volumes nommés, bind mounts, volumes anonymes déclarés par l'image) */
  _mounts(c, img, specs) {
    const done = new Set();
    for (const s of specs) {
      if (!s.target || s.target[0] !== '/') throw new DockerError('invalid mount path: \'' + (s.target || '') + '\' mount path must be absolute', { raw: true });
      if (done.has(s.target)) throw new DockerError('Duplicate mount point: ' + s.target); done.add(s.target);
      if (s.type === 'bind') {
        const src = this.hostFs.norm('/', s.source);
        if (!this.hostFs.exists(src)) { if (s.mountFlag) throw new DockerError('invalid mount config for type "bind": bind source path does not exist: ' + src, { raw: true }); this.hostFs.mkdirp(src); }
        c.fs.mount(s.target, this.hostFs, src, s.ro);
        c.mounts.push({ type: 'bind', source: src, destination: s.target, rw: !s.ro, name: '' });
      } else {
        const v = s.anonymous ? this.createVolume(null, { anonymous: true }) : (this.getVolume(s.source) || this.createVolume(s.source));
        if (!v.seeded) { v.seeded = true; if (c.fs.isDir(s.target) && v.vfs.isEmpty('/')) VFS.prototype.copyTree.call(new VFS(c.fs.root), s.target, v.vfs, '/'); }
        c.fs.mount(s.target, v.vfs, '/', s.ro);
        c.mounts.push({ type: 'volume', source: v.mountpoint, destination: s.target, rw: !s.ro, name: v.name });
      }
    }
    (c.config.volumes || []).forEach(t => {
      if (done.has(t)) return;
      const v = this.createVolume(null, { anonymous: true }); v.seeded = true;
      VFS.prototype.copyTree.call(new VFS(c.fs.root), t, v.vfs, '/');
      c.fs.mount(t, v.vfs, '/'); c.mounts.push({ type: 'volume', source: v.mountpoint, destination: t, rw: true, name: v.name });
    });
  }

  /* ------------------------------------------------ conteneurs : démarrage / arrêt */
  _bindings(c) {
    const out = [];
    c.host.ports.forEach(p => out.push({ ip: p.ip || '0.0.0.0', hostPort: p.hostPort, port: p.port, proto: p.proto }));
    if (c.host.publishAll) (c.config.exposed || []).forEach(e => { const [pt, pr] = e.split('/'); if (!out.some(b => b.port === Number(pt) && b.proto === pr)) out.push({ ip: '0.0.0.0', hostPort: 0, port: Number(pt), proto: pr, auto: true }); });
    return out;
  }
  start(c) {
    if (c.running) return;
    const bind = c._bound || this._bindings(c);
    const net = this.getNetwork(c.host.network);
    // conflits de ports
    const others = this.containers.filter(x => x !== c && x.running && x._bound);
    for (const b of bind) {
      if (!b.hostPort) continue;
      const hit = others.find(o => o._bound.some(ob => ob.hostPort === b.hostPort && ob.proto === b.proto && (ob.ip === b.ip || ob.ip === '0.0.0.0' || b.ip === '0.0.0.0')));
      const ep = c.name + ' (' + this.hex(64) + ')';
      if (hit) throw new DockerError('driver failed programming external connectivity on endpoint ' + ep + ': Bind for ' + b.ip + ':' + b.hostPort + ' failed: port is already allocated', { code: 'ports' });
      if (HOST_RESERVED[b.hostPort] && b.proto === 'tcp') throw new DockerError('driver failed programming external connectivity on endpoint ' + ep + ': failed to bind port ' + b.ip + ':' + b.hostPort + '/tcp: Error starting userland proxy: listen tcp4 ' + b.ip + ':' + b.hostPort + ': bind: address already in use', { code: 'ports' });
      if (net && net.driver === 'host') { /* ports ignorés en mode host */ }
    }
    // commande exécutable ?
    const eff = c.effective();
    const spec = c.spec; const beh = NS.BEHAVIORS[spec.behavior] || {};
    const isSvc = !!(beh && spec.svc && eff[0] === spec.svc) || !!(beh.oneshot && eff[0] === c.config.imageCmd[0]);
    if (!isSvc && eff.length) { const bad = NS.shellCanRun ? NS.shellCanRun(this, c, eff) : null; if (bad) { throw new DockerError('failed to create task for container: failed to create shim task: OCI runtime create failed: runc create failed: unable to start container process: exec: "' + eff[0] + '": ' + bad + ': unknown', { code: 'oci' }); } }
    // réseaux
    Object.keys(c.nets).forEach(nm => { const n = this.getNetwork(nm); if (n) this._attach(c, n, c.nets[nm].aliases); });
    // ports automatiques
    bind.forEach(b => { if (!b.hostPort) { while (this.containers.some(o => o.running && o._bound && o._bound.some(x => x.hostPort === this.nextEph))) this.nextEph++; b.hostPort = this.nextEph++; } });
    c._bound = bind;
    c.runToken++; c.manualStop = false; c.listen = []; c.procs = [];
    c.state.status = 'running'; c.state.startedAt = this.clock.now; c.state.finishedAt = null; c.state.error = ''; c.state.pid = 1000 + Math.floor(this.rng() * 30000);
    this._etcFiles(c);
    this.emit('container', 'start', c.id, { image: c.imageRef, name: c.name });
    if (c.state.restarting) { c.state.restarting = false; }
    this._launch(c, eff, beh, isSvc);
  }
  _etcFiles(c) {
    const ip = c.primaryIp() || '127.0.0.1';
    c.fs.mkdirp('/etc'); c.fs.write('/etc/hostname', c.config.hostname + '\n');
    c.fs.write('/etc/hosts', '127.0.0.1\tlocalhost\n::1\tlocalhost ip6-localhost ip6-loopback\nfe00::0\tip6-localnet\nff00::0\tip6-mcastprefix\nff02::1\tip6-allnodes\nff02::2\tip6-allrouters\n' + (c.primaryIp() ? ip + '\t' + c.config.hostname + '\n' : ''));
    const user = c.netList().some(n => { const x = this.getNetwork(n); return x && !x.builtin; });
    c.fs.write('/etc/resolv.conf', user ? '# Generated by Docker Engine.\nnameserver 127.0.0.11\nsearch .\noptions ndots:0\n' : '# Generated by Docker Engine.\nnameserver 192.168.65.7\n');
  }
  _sched(c, ms, fn) { const tok = c.runToken; const ev = this.clock.schedule(ms, () => { if (c.runToken === tok && c.state.status === 'running') fn(); }); c.timers.push(ev); return ev; }
  _launch(c, eff, beh, isSvc) {
    if (isSvc && beh.oneshot) { const r = beh.run(c, this); c.proc = { type: 'oneshot', handlesTerm: true }; this._sched(c, 5, () => { this.log(c, r.out.replace(/\n$/, '')); this._exit(c, r.code); }); return; }
    if (isSvc) {
      const b = beh.boot(c, this, c.spec, eff.slice(1)); let last = 0;
      b.lines.forEach(l => { last = Math.max(last, l[0]); this._sched(c, l[0], () => this.log(c, typeof l[1] === 'function' ? l[1]() : l[1])); });
      c.proc = { type: 'service', beh, handlesTerm: true };
      if (b.fail) { this._sched(c, last + 5, () => this._exit(c, b.fail)); return; }
      this._sched(c, b.readyAt, () => { c.listen = beh.listen.slice(); c.procs = b.procs || []; if (b.onReady) b.onReady(); this.changed(); });
      return;
    }
    if (!eff.length) { this._sched(c, 5, () => this._exit(c, 0)); return; }
    NS.shellLaunch(this, c, eff);
  }
  log(c, text, stream) {
    String(text).split('\n').forEach(line => { const e = { t: this.wall(), text: line, stream: stream || 'stdout' }; c.logs.push(e); c.subs.forEach(s => s.log && s.log(e)); });
    if (c.logs.length > 2000) c.logs.splice(0, c.logs.length - 2000);
    this.changed();
  }
  _exit(c, code, opts) {
    if (c.state.status !== 'running' && c.state.status !== 'paused') return;
    opts = opts || {};
    const ranMs = this.clock.now - c.state.startedAt;
    c.runToken++; c.timers.forEach(t => this.clock.cancel(t)); c.timers = [];
    if (c.proc && c.proc.abort) { try { c.proc.abort(); } catch (e) { } }
    c.state.status = 'exited'; c.state.exitCode = code; c.state.finishedAt = this.clock.now; c.state.pid = 0; c.listen = []; c.procs = []; c._bound = null;
    Object.keys(c.nets).forEach(nm => { const n = this.getNetwork(nm); if (n) this._detach(c, n); });
    this.emit('container', 'die', c.id, { exitCode: String(code), name: c.name, image: c.imageRef });
    c.subs.slice().forEach(s => s.exit && s.exit(code));
    if (c.host.autoRemove) { this.removeContainer(c, { force: true, volumes: true }); return; }
    const rp = c.host.restart;
    const should = !c.manualStop && (rp.name === 'always' || rp.name === 'unless-stopped' || (rp.name === 'on-failure' && code !== 0 && (!rp.max || c.state.restartCount < rp.max)));
    if (should) {
      if (ranMs > 10000) c.state.restartCount = 0;
      const delay = Math.min(100 * Math.pow(2, c.state.restartCount), 60000);
      c.state.restartCount++; c.state.status = 'restarting'; c.state.restarting = true; c.state.finishedAt = this.clock.now;
      const tok = c.restartTok = (c.restartTok || 0) + 1;
      this.clock.schedule(delay, () => { if (c.restartTok !== tok || c.state.status !== 'restarting') return; try { this.start(c); this.emit('container', 'restart', c.id, { name: c.name }); } catch (e) { c.state.status = 'exited'; } this.changed(); });
    }
    this.changed();
  }
  /* arrêt : SIGTERM puis SIGKILL après timeout (secondes) */
  stop(c, timeout, cb) {
    cb = cb || (() => { });
    if (c.state.status === 'restarting') { c.restartTok = (c.restartTok || 0) + 1; c.state.status = 'exited'; c.manualStop = true; this.changed(); return cb(); }
    if (!c.running) return cb();
    c.manualStop = true; this.emit('container', 'kill', c.id, { signal: c.config.stopSignal === 'SIGQUIT' ? '3' : c.config.stopSignal === 'SIGINT' ? '2' : '15', name: c.name });
    const tok = c.runToken;
    const handles = c.proc && c.proc.handlesTerm;
    if (handles) {
      this.wait(250, () => { if (c.runToken !== tok) return cb(); const beh = c.proc.beh; if (beh && beh.stopLines) this.log(c, beh.stopLines(c, this).join('\n')); this.emit('container', 'stop', c.id, { name: c.name }); this._exit(c, 0); cb(); });
    } else {
      const ms = Math.max(0, (timeout === undefined ? 10 : timeout) * 1000);
      this.wait(ms, () => { if (c.runToken !== tok) return cb(); this.emit('container', 'kill', c.id, { signal: '9', name: c.name }); this.emit('container', 'stop', c.id, { name: c.name }); this._exit(c, 137); cb(); });
    }
  }
  kill(c, sig) {
    if (!c.running) throw new DockerError('cannot kill container: ' + c.name + ': container ' + c.id + ' is not running', { code: 'notrunning' });
    const s = String(sig || 'KILL').toUpperCase().replace(/^SIG/, '');
    const num = { KILL: 9, TERM: 15, INT: 2, QUIT: 3, HUP: 1, USR1: 10, USR2: 12, '9': 9, '15': 15, '2': 2, '3': 3, '1': 1 }[s];
    if (num === undefined) throw new DockerError('Error parsing signal: "' + sig + '"', { raw: true });
    c.manualStop = true; this.emit('container', 'kill', c.id, { signal: String(num), name: c.name });
    if (num === 9) { this._exit(c, 137); return; }
    if (c.proc && c.proc.handlesTerm && [15, 2, 3].includes(num)) { const beh = c.proc.beh; if (beh && beh.stopLines) this.log(c, beh.stopLines(c, this).join('\n')); this._exit(c, num === 15 ? 0 : 0); }
    else c.manualStop = false;
  }
  restart(c, timeout, cb) {
    this.stop(c, timeout, () => { try { c.manualStop = false; this.start(c); this.emit('container', 'restart', c.id, { name: c.name }); cb(null); } catch (e) { cb(e); } });
  }
  pause(c) { if (c.state.status !== 'running') throw new DockerError(c.state.status === 'paused' ? 'Container ' + c.id + ' is already paused' : 'Container ' + c.id + ' is not running'); c.state.status = 'paused'; this.emit('container', 'pause', c.id, { name: c.name }); }
  unpause(c) { if (c.state.status !== 'paused') throw new DockerError('Container ' + c.id + ' is not paused'); c.state.status = 'running'; this.emit('container', 'unpause', c.id, { name: c.name }); }
  removeContainer(c, o) {
    o = o || {};
    if (c.running && !o.force) throw new DockerError('cannot remove container "/' + c.name + '": container is ' + c.state.status + ': stop the container before removing or force remove', { code: 'running' });
    if (c.running) { c.manualStop = true; this._exit(c, 137); }
    c.restartTok = (c.restartTok || 0) + 1;
    this.containers = this.containers.filter(x => x !== c);
    Object.keys(c.nets).forEach(nm => { const n = this.getNetwork(nm); if (n) this._detach(c, n); });
    if (o.volumes || c.host.autoRemove) c.mounts.filter(m => m.type === 'volume').forEach(m => { const v = this.getVolume(m.name); if (v && v.anonymous && !this.containers.some(x => x.mounts.some(y => y.name === v.name))) { this.volumes = this.volumes.filter(z => z !== v); this.emit('volume', 'destroy', v.name, {}); } });
    this.emit('container', 'destroy', c.id, { name: c.name, image: c.imageRef });
  }
  rename(c, nn) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(nn)) throw new DockerError('Invalid container name (' + nn + '), only [a-zA-Z0-9][a-zA-Z0-9_.-] are allowed');
    const ex = this.containers.find(x => x.name === nn); if (ex) throw new DockerError('Conflict. The container name "/' + nn + '" is already in use by container "' + ex.id + '". You have to remove (or rename) that container to be able to reuse that name.');
    c.name = nn; this.emit('container', 'rename', c.id, { name: nn });
  }

  /* ------------------------------------------------ présentation */
  statusText(c) {
    const s = c.state; const now = this.clock.now;
    if (s.status === 'created') return 'Created';
    if (s.status === 'running') return 'Up ' + U.humanDuration(now - s.startedAt).replace('Less than a second', 'Less than a second');
    if (s.status === 'paused') return 'Up ' + U.humanDuration(now - s.startedAt) + ' (Paused)';
    if (s.status === 'restarting') return 'Restarting (' + s.exitCode + ') ' + U.humanDuration(now - s.finishedAt) + ' ago';
    return 'Exited (' + s.exitCode + ') ' + U.humanDuration(now - (s.finishedAt === null ? s.startedAt : s.finishedAt)) + ' ago';
  }
  portsText(c) {
    const b = c._bound; const out = [];
    if (c.running && b) {
      const pub = new Set();
      b.forEach(p => { if (p.hostPort) { pub.add(p.port + '/' + p.proto); const v6 = p.ip === '0.0.0.0'; out.push(p.ip + ':' + p.hostPort + '->' + p.port + '/' + p.proto); if (v6) out.push('[::]:' + p.hostPort + '->' + p.port + '/' + p.proto); } });
      (c.config.exposed || []).forEach(e => { if (!pub.has(e)) out.push(e); });
    } else if (c.running) (c.config.exposed || []).forEach(e => out.push(e));
    else if (c.state.status === 'restarting' || c.state.status === 'exited' || c.state.status === 'created') { /* ports non publiés tant que le conteneur ne tourne pas */ }
    // regroupe 80/tcp 443/tcp comme Docker : on garde simple
    return out.join(', ');
  }
  netStatus(c) { return c.netList().join(','); }
  inspectContainer(c) {
    const nets = {}; Object.keys(c.nets).forEach(nm => { const e = c.nets[nm]; nets[nm] = { IPAMConfig: null, Links: null, Aliases: e.aliases.length ? e.aliases : (c.running && nm !== 'bridge' && nm !== 'host' && nm !== 'none' ? [c.name, c.config.hostname] : null), MacAddress: e.mac, NetworkID: e.netId, EndpointID: e.ip ? e.endpointId : '', Gateway: e.gateway, IPAddress: e.ip, IPPrefixLen: e.ip ? Number((this.getNetwork(nm) || { subnet: '/16' }).subnet.split('/')[1]) : 0, IPv6Gateway: '', GlobalIPv6Address: '', GlobalIPv6PrefixLen: 0, DriverOpts: null, DNSNames: nm !== 'bridge' && nm !== 'host' && nm !== 'none' ? [c.name, c.config.hostname] : null }; });
    const ports = {}; (c.config.exposed || []).forEach(e => { ports[e] = null; });
    if (c.running && c._bound) c._bound.forEach(b => { const k = b.port + '/' + b.proto; const e = { HostIp: b.ip, HostPort: String(b.hostPort) }; ports[k] = ports[k] || []; ports[k].push(e); if (b.ip === '0.0.0.0') ports[k].push({ HostIp: '::', HostPort: String(b.hostPort) }); });
    const pb = {}; c.host.ports.forEach(p => { const k = p.port + '/' + p.proto; pb[k] = pb[k] || []; pb[k].push({ HostIp: p.ip || '', HostPort: p.hostPort ? String(p.hostPort) : '' }); });
    const img = this.images.find(i => i.id === c.imageId);
    const first = nets[c.netList()[0]] || {};
    const eff = c.config.entrypoint.concat(c.config.cmd);
    return {
      Id: c.id, Created: U.iso(this.epoch + c.created), Path: eff[0] || '', Args: eff.slice(1),
      State: { Status: c.state.status, Running: c.state.status === 'running' || c.state.status === 'paused', Paused: c.state.status === 'paused', Restarting: c.state.status === 'restarting', OOMKilled: false, Dead: false, Pid: c.state.pid, ExitCode: c.state.exitCode, Error: c.state.error || '', StartedAt: c.state.startedAt === null ? '0001-01-01T00:00:00Z' : U.iso(this.epoch + c.state.startedAt), FinishedAt: c.state.finishedAt === null ? '0001-01-01T00:00:00Z' : U.iso(this.epoch + c.state.finishedAt) },
      Image: 'sha256:' + c.imageId, ResolvConfPath: '/var/lib/docker/containers/' + c.id + '/resolv.conf', HostnamePath: '/var/lib/docker/containers/' + c.id + '/hostname', HostsPath: '/var/lib/docker/containers/' + c.id + '/hosts', LogPath: '/var/lib/docker/containers/' + c.id + '/' + c.id + '-json.log',
      Name: '/' + c.name, RestartCount: c.state.restartCount, Driver: 'overlay2', Platform: 'linux', MountLabel: '', ProcessLabel: '', AppArmorProfile: 'docker-default', ExecIDs: null,
      HostConfig: { Binds: c.mounts.filter(m => m.type === 'bind').map(m => m.source + ':' + m.destination + (m.rw ? '' : ':ro')).concat(c.mounts.filter(m => m.type === 'volume' && !this.getVolume(m.name).anonymous).map(m => m.name + ':' + m.destination + (m.rw ? '' : ':ro'))), ContainerIDFile: '', LogConfig: { Type: 'json-file', Config: {} }, NetworkMode: c.host.network === 'bridge' ? 'default' : c.host.network, PortBindings: pb, RestartPolicy: { Name: c.host.restart.name, MaximumRetryCount: c.host.restart.max || 0 }, AutoRemove: c.host.autoRemove, Privileged: false, PublishAllPorts: c.host.publishAll, ReadonlyRootfs: false },
      GraphDriver: { Data: {}, Name: 'overlay2' },
      Mounts: c.mounts.map(m => m.type === 'volume' ? { Type: 'volume', Name: m.name, Source: m.source, Destination: m.destination, Driver: 'local', Mode: m.rw ? 'z' : 'ro', RW: m.rw, Propagation: '' } : { Type: 'bind', Source: m.source, Destination: m.destination, Mode: m.rw ? '' : 'ro', RW: m.rw, Propagation: 'rprivate' }),
      Config: { Hostname: c.config.hostname, Domainname: '', User: c.config.user, AttachStdin: false, AttachStdout: true, AttachStderr: true, ExposedPorts: Object.keys(ports).reduce((a, k) => { a[k] = {}; return a; }, {}), Tty: c.config.tty, OpenStdin: c.config.openStdin, StdinOnce: false, Env: c.config.env, Cmd: c.config.cmd, Image: c.imageRef, Volumes: null, WorkingDir: c.config.workdir, Entrypoint: c.config.entrypoint.length ? c.config.entrypoint : null, OnBuild: null, Labels: c.config.labels, StopSignal: c.config.stopSignal },
      NetworkSettings: { Bridge: '', SandboxID: U.hexOf('sb' + c.id, 64), SandboxKey: '/var/run/docker/netns/' + U.hexOf('ns' + c.id, 12), Ports: ports, HairpinMode: false, LinkLocalIPv6Address: '', LinkLocalIPv6PrefixLen: 0, SecondaryIPAddresses: null, SecondaryIPv6Addresses: null, EndpointID: first.EndpointID || '', Gateway: first.Gateway || '', GlobalIPv6Address: '', GlobalIPv6PrefixLen: 0, IPAddress: (nets.bridge || {}).IPAddress || '', IPPrefixLen: (nets.bridge || {}).IPPrefixLen || 0, IPv6Gateway: '', MacAddress: (nets.bridge || {}).MacAddress || '', Networks: nets },
    };
  }
  inspectImage(i) {
    const c = i.config; return {
      Id: 'sha256:' + i.id, RepoTags: i.refs.map(r => r.repo + ':' + r.tag), RepoDigests: i.local ? [] : i.refs.map(r => r.repo + '@' + i.digest), Parent: '', Comment: '', Created: U.iso(this.epoch + i.created), DockerVersion: '27.3.1', Author: '', Architecture: 'amd64', Os: 'linux', Size: i.size, VirtualSize: i.size,
      Config: { Hostname: '', User: c.user || '', ExposedPorts: (c.exposed || []).reduce((a, k) => { a[k] = {}; return a; }, {}), Env: c.env, Cmd: c.cmd, WorkingDir: c.workdir || '', Entrypoint: c.entrypoint.length ? c.entrypoint : null, Labels: null, StopSignal: c.stopSignal },
      GraphDriver: { Data: {}, Name: 'overlay2' }, RootFS: { Type: 'layers', Layers: i.layers.map(l => 'sha256:' + U.hexOf('full' + l.id, 64)) }, Metadata: { LastTagTime: '0001-01-01T00:00:00Z' },
    };
  }
  inspectNetwork(n) {
    const cont = {}; Object.keys(n.members).forEach(id => { const c = this.containers.find(x => x.id === id); if (!c) return; const e = n.members[id]; cont[id] = { Name: c.name, EndpointID: e.endpointId, MacAddress: e.mac, IPv4Address: e.ip + '/' + n.subnet.split('/')[1], IPv6Address: '' }; });
    return { Name: n.name, Id: n.id, Created: U.iso(this.epoch + n.created), Scope: 'local', Driver: n.driver, EnableIPv6: false, IPAM: { Driver: 'default', Options: null, Config: n.subnet ? [{ Subnet: n.subnet, Gateway: n.gateway }] : [] }, Internal: n.internal, Attachable: false, Ingress: false, ConfigFrom: { Network: '' }, ConfigOnly: false, Containers: cont, Options: n.name === 'bridge' ? { 'com.docker.network.bridge.default_bridge': 'true', 'com.docker.network.bridge.enable_icc': 'true', 'com.docker.network.bridge.enable_ip_masquerade': 'true', 'com.docker.network.bridge.host_binding_ipv4': '0.0.0.0', 'com.docker.network.bridge.name': 'docker0', 'com.docker.network.driver.mtu': '1500' } : {}, Labels: n.labels };
  }
  inspectVolume(v) { return { CreatedAt: U.iso(this.epoch + v.created).replace(/\.\d+Z$/, 'Z'), Driver: 'local', Labels: Object.keys(v.labels).length ? v.labels : null, Mountpoint: v.mountpoint, Name: v.name, Options: null, Scope: 'local' }; }

  /* ------------------------------------------------ réseau : DNS, joignabilité, HTTP */
  /* rend l'adresse d'un nom vu depuis `from` (conteneur ou null = hôte) */
  resolveName(from, name) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) return { ip: name };
    const lc = String(name).toLowerCase();
    if (lc === 'localhost') return { ip: '127.0.0.1', self: true };
    if (!from) { if (lc === this.hostname) return { ip: '127.0.0.1', self: true }; }
    else {
      for (const nm of from.netList()) {
        const n = this.getNetwork(nm); if (!n || n.builtin || !from.nets[nm].ip) continue;
        for (const id in n.members) { const m = this.containers.find(x => x.id === id); if (!m) continue; const ep = n.members[id]; if (m.name === lc || m.shortId === lc || ep.aliases.includes(lc) || (m === from && m.config.hostname === lc)) return { ip: ep.ip, container: m }; }
      }
      if (lc === from.config.hostname) return { ip: from.primaryIp() || '127.0.0.1', self: true, container: from };
      const none = from.netList().every(n => n === 'none'); if (none) return null;
    }
    if (NS.INTERNET[lc]) return { ip: NS.INTERNET[lc].ip, internet: lc };
    return null;
  }
  containerByIp(ip) { for (const c of this.containers) { if (!c.running) continue; for (const nm in c.nets) if (c.nets[nm].ip === ip) return c; } return null; }
  /* `from` peut-il atteindre l'IP d'un conteneur ? (même réseau, ou hôte → bridge) */
  canReach(from, target) {
    if (!from) return true;
    return from.netList().some(nm => from.nets[nm].ip && target.nets[nm] && target.nets[nm].ip);
  }
  srcIpFor(from, target) {
    if (!from) { const nm = target && target.netList().find(n => target.nets[n].ip); const n = nm && this.getNetwork(nm); return n ? n.gateway : '172.17.0.1'; }
    if (!target) return from.primaryIp();
    const nm = from.netList().find(n => from.nets[n].ip && target.nets[n] && target.nets[n].ip); return nm ? from.nets[nm].ip : from.primaryIp();
  }
  /* requête HTTP simulée. from : conteneur ou null (hôte). Rend { err:{code,msg,delay?} } ou { res } */
  httpFetch(from, url, o) {
    o = o || {};
    const m = /^(?:(https?):\/\/)?(?:[^@/]*@)?(\[[^\]]+\]|[^/:?#]+)(?::(\d+))?([/?#].*)?$/.exec(url);
    if (!m) return { err: { code: 3, msg: "URL rejected: Malformed input to a URL function" } };
    const scheme = m[1] || 'http'; const host = m[2]; const port = m[3] ? Number(m[3]) : (scheme === 'https' ? 443 : 80); const path = m[4] && m[4][0] === '/' ? m[4] : '/' + (m[4] || '');
    const target = this.resolveName(from, host);
    if (!target) return { err: { code: 6, msg: 'Could not resolve host: ' + host } };
    if (target.internet) {
      if (from && from.netList().every(n => n === 'none')) return { err: { code: 6, msg: 'Could not resolve host: ' + host } };
      const site = NS.INTERNET[target.internet]; if (!site.body) return { err: { code: 7, msg: 'Failed to connect to ' + host + ' port ' + port + ' after 20 ms: Couldn\'t connect to server' } };
      return { res: { status: 200, reason: 'OK', headers: { 'Content-Type': 'text/html', 'Content-Length': String(site.body.length), Date: U.httpDate(this.wall()) }, body: site.body }, ip: site.ip };
    }
    const refuse = () => ({ err: { code: 7, msg: 'Failed to connect to ' + host + ' port ' + port + ' after 0 ms: Couldn\'t connect to server' } });
    let c = null;
    if (target.self) {
      if (from) { c = from; if (!c.listen.includes(port)) return refuse(); }
      else {
        const hn = this.containers.find(x => x.running && x._bound && x._bound.some(b => b.hostPort === port && b.proto === 'tcp' && (b.ip === '0.0.0.0' || b.ip === '127.0.0.1')));
        const hostNet = this.containers.find(x => x.running && x.host.network === 'host' && x.listen.includes(port));
        if (hostNet) c = hostNet;
        else if (!hn) return refuse();
        else { c = hn; const b = hn._bound.find(x => x.hostPort === port); if (!c.listen.includes(b.port)) return { err: { code: 52, msg: 'Empty reply from server' } }; return this._serve(c, b.port, from, host, port, path, o, '172.17.0.1'); }
      }
      return this._serve(c, port, from, host, port, path, o, from ? '127.0.0.1' : '127.0.0.1');
    }
    c = this.containerByIp(target.ip);
    if (!c) { const gw = this.networks.find(n => n.gateway === target.ip && n.driver === 'bridge'); if (gw && from) { const hn = this.containers.find(x => x.running && x._bound && x._bound.some(b => b.hostPort === port)); if (hn) { const b = hn._bound.find(x => x.hostPort === port); if (!hn.listen.includes(b.port)) return { err: { code: 52, msg: 'Empty reply from server' } }; return this._serve(hn, b.port, from, host, port, path, o, this.srcIpFor(from, null)); } } return from ? { err: { code: 28, msg: 'Failed to connect to ' + host + ' port ' + port + ' after 2001 ms: Timeout was reached', delay: 2000 } } : refuse(); }
    if (from && !this.canReach(from, c)) return { err: { code: 28, msg: 'Failed to connect to ' + host + ' port ' + port + ' after 2001 ms: Timeout was reached', delay: 2000 } };
    if (!c.listen.includes(port)) return refuse();
    return this._serve(c, port, from, host, port, path, o, this.srcIpFor(from, c));
  }
  _serve(c, cport, from, host, port, path, o, srcIp) {
    const beh = NS.BEHAVIORS[c.spec.behavior] || {};
    if (!beh.http || beh.noHttp) return { err: { code: 52, msg: 'Empty reply from server' } };
    if (cport !== beh.listen[0]) return { err: { code: 52, msg: 'Empty reply from server' } };
    const res = beh.http(c, this, { method: o.method || 'GET', path, host: host + (port !== 80 ? ':' + port : ''), from: srcIp, ua: o.ua });
    return { res, ip: c.primaryIp() };
  }
}
NS.Lab = Lab; NS.Container = Container;
})(typeof window !== 'undefined' ? window : globalThis);
