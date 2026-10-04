/* registry.js — registre distant fictif : catalogue d'images, comportements scriptés des services, « Internet » minimal */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const { U, VFS } = NS;

/* ------------------------------------------------ systèmes de fichiers de base */
const OSREL = {
  alpine: 'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.20.3\nPRETTY_NAME="Alpine Linux v3.20"\nHOME_URL="https://alpinelinux.org/"\nBUG_REPORT_URL="https://gitlab.alpinelinux.org/alpine/aports/-/issues"\n',
  debian: 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\nHOME_URL="https://www.debian.org/"\nSUPPORT_URL="https://www.debian.org/support"\nBUG_REPORT_URL="https://bugs.debian.org/"\n',
  ubuntu: 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS (Noble Numbat)"\nVERSION_CODENAME=noble\nID=ubuntu\nID_LIKE=debian\nHOME_URL="https://www.ubuntu.com/"\nSUPPORT_URL="https://help.ubuntu.com/"\nBUG_REPORT_URL="https://bugs.launchpad.net/ubuntu/"\nUBUNTU_CODENAME=noble\n',
};
const PASSWD = 'root:x:0:0:root:/root:/bin/sh\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nnobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin\n';
const DIRS = {
  alpine: ['bin', 'dev', 'etc', 'home', 'lib', 'media', 'mnt', 'opt', 'proc', 'root', 'run', 'sbin', 'srv', 'sys', 'tmp', 'usr', 'var'],
  busybox: ['bin', 'dev', 'etc', 'home', 'lib', 'proc', 'root', 'sys', 'tmp', 'usr', 'var'],
  debian: ['bin', 'boot', 'dev', 'etc', 'home', 'lib', 'lib64', 'media', 'mnt', 'opt', 'proc', 'root', 'run', 'sbin', 'srv', 'sys', 'tmp', 'usr', 'var'],
  scratch: ['dev', 'etc', 'proc', 'sys'],
};
function baseFs(base) {
  const v = new VFS(); v.home = base === 'scratch' ? '/' : '/root';
  (DIRS[base === 'ubuntu' ? 'debian' : base] || DIRS.debian).forEach(d => v.mkdirp('/' + d));
  if (base !== 'scratch') { v.write('/etc/passwd', PASSWD); v.write('/etc/group', 'root:x:0:\n'); v.mkdirp('/var/log'); v.mkdirp('/var/lib'); v.mkdirp('/usr/bin'); v.mkdirp('/usr/local/bin'); }
  if (OSREL[base]) { v.write('/etc/os-release', OSREL[base]); }
  if (base === 'alpine') v.write('/etc/alpine-release', '3.20.3\n');
  if (base === 'debian' || base === 'ubuntu') v.write('/etc/debian_version', base === 'ubuntu' ? 'trixie/sid\n' : '12.7\n');
  return v;
}
NS.baseFs = baseFs;

/* ------------------------------------------------ catalogue */
const R = NS.REGISTRY = {};
function def(repo, o) { o.repo = repo; R[repo] = o; }
const SH = ['/bin/sh'];

def('hello-world', { base: 'scratch', entrypoint: [], cmd: ['/hello'], env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'], exposed: [], behavior: 'hello',
  variants: [{ tags: ['latest', 'linux'], v: '1.0', size: 13256, layers: 1, age: 540 }] });
def('alpine', { base: 'alpine', entrypoint: [], cmd: SH, env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'], exposed: [],
  variants: [{ tags: ['latest', '3', '3.20', '3.20.3'], v: '3.20.3', size: 7800000, layers: 1, age: 20 }, { tags: ['3.19', '3.19.4'], v: '3.19.4', size: 7400000, layers: 1, age: 70 }] });
def('busybox', { base: 'busybox', entrypoint: [], cmd: ['sh'], env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'], exposed: [],
  variants: [{ tags: ['latest', '1', '1.37', '1.37.0'], v: '1.37.0', size: 4260000, layers: 1, age: 60 }] });
def('ubuntu', { base: 'ubuntu', entrypoint: [], cmd: ['/bin/bash'], env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'], exposed: [],
  variants: [{ tags: ['latest', '24.04', 'noble'], v: '24.04', size: 78100000, layers: 1, age: 30 }, { tags: ['22.04', 'jammy'], v: '22.04', size: 77900000, layers: 1, age: 50 }] });
def('debian', { base: 'debian', entrypoint: [], cmd: ['bash'], env: ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'], exposed: [],
  variants: [{ tags: ['latest', '12', 'bookworm'], v: '12.7', size: 117000000, layers: 1, age: 25 }, { tags: ['bookworm-slim', 'stable-slim'], v: '12.7', size: 74800000, layers: 1, age: 25, id: 'slim' }] });
def('nginx', { base: 'debian', entrypoint: ['/docker-entrypoint.sh'], cmd: ['nginx', '-g', 'daemon off;'], exposed: ['80/tcp'], behavior: 'nginx', svc: 'nginx', stopSignal: 'SIGQUIT',
  env: v => ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NGINX_VERSION=' + v.v, 'NJS_VERSION=0.8.6', 'NJS_RELEASE=1~bookworm', 'PKG_RELEASE=1~bookworm'],
  variants: [{ tags: ['latest', '1', '1.27', '1.27.2', 'stable'], v: '1.27.2', size: 192000000, layers: 7, age: 14 }, { tags: ['alpine', '1.27-alpine', '1.27.2-alpine'], v: '1.27.2', base: 'alpine', size: 47900000, layers: 7, age: 14, id: 'alpine' }, { tags: ['1.26', '1.26.2'], v: '1.26.2', size: 188000000, layers: 7, age: 80 }] });
def('httpd', { base: 'debian', entrypoint: [], cmd: ['httpd-foreground'], exposed: ['80/tcp'], behavior: 'httpd', svc: 'httpd-foreground',
  env: v => ['PATH=/usr/local/apache2/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'HTTPD_PREFIX=/usr/local/apache2', 'HTTPD_VERSION=' + v.v], workdir: '/usr/local/apache2',
  variants: [{ tags: ['latest', '2', '2.4', '2.4.62'], v: '2.4.62', size: 148000000, layers: 6, age: 40 }, { tags: ['alpine', '2.4-alpine'], v: '2.4.62', base: 'alpine', size: 61000000, layers: 6, age: 40, id: 'alpine' }] });
def('redis', { base: 'debian', entrypoint: ['docker-entrypoint.sh'], cmd: ['redis-server'], exposed: ['6379/tcp'], behavior: 'redis', svc: 'redis-server', volumes: ['/data'], workdir: '/data',
  env: v => ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'REDIS_VERSION=' + v.v],
  variants: [{ tags: ['latest', '7', '7.4', '7.4.1'], v: '7.4.1', size: 117000000, layers: 8, age: 20 }, { tags: ['alpine', '7-alpine', '7.4-alpine'], v: '7.4.1', base: 'alpine', size: 41400000, layers: 8, age: 20, id: 'alpine' }] });
def('postgres', { base: 'debian', entrypoint: ['docker-entrypoint.sh'], cmd: ['postgres'], exposed: ['5432/tcp'], behavior: 'postgres', svc: 'postgres', volumes: ['/var/lib/postgresql/data'], stopSignal: 'SIGINT',
  env: v => ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'GOSU_VERSION=1.17', 'LANG=en_US.utf8', 'PG_MAJOR=' + v.major, 'PG_VERSION=' + v.v + '-1.pgdg120+1', 'PGDATA=/var/lib/postgresql/data'],
  variants: [{ tags: ['latest', '17', '17.0'], v: '17.0', major: '17', size: 438000000, layers: 13, age: 15 }, { tags: ['16', '16.4'], v: '16.4', major: '16', size: 432000000, layers: 13, age: 60 }, { tags: ['alpine', '17-alpine'], v: '17.0', major: '17', base: 'alpine', size: 275000000, layers: 12, age: 15, id: 'alpine' }] });
def('mysql', { base: 'debian', entrypoint: ['docker-entrypoint.sh'], cmd: ['mysqld'], exposed: ['3306/tcp', '33060/tcp'], behavior: 'mysql', svc: 'mysqld', volumes: ['/var/lib/mysql'],
  env: v => ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'MYSQL_MAJOR=' + v.major, 'MYSQL_VERSION=' + v.v + '-1.el9'],
  variants: [{ tags: ['latest', '9', '9.1', '9.1.0'], v: '9.1.0', major: 'innovation', size: 859000000, layers: 10, age: 10 }, { tags: ['8.0', '8', '8.0.40'], v: '8.0.40', major: '8.0', size: 797000000, layers: 10, age: 10, id: '8' }] });
def('mariadb', { base: 'ubuntu', entrypoint: ['docker-entrypoint.sh'], cmd: ['mariadbd'], exposed: ['3306/tcp'], behavior: 'mysql', svc: 'mariadbd', volumes: ['/var/lib/mysql'],
  env: v => ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'MARIADB_VERSION=1:' + v.v + '+maria~ubu2404'],
  variants: [{ tags: ['latest', '11', '11.5', '11.5.2'], v: '11.5.2', size: 406000000, layers: 8, age: 20 }] });
def('node', { base: 'debian', entrypoint: ['docker-entrypoint.sh'], cmd: ['node'], exposed: [], behavior: 'none',
  env: v => ['PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'NODE_VERSION=' + v.v, 'YARN_VERSION=1.22.22'],
  variants: [{ tags: ['latest', '22', '22.9', '22.9.0'], v: '22.9.0', size: 1120000000, layers: 9, age: 12 }, { tags: ['20', '20.18'], v: '20.18.0', size: 1100000000, layers: 9, age: 30, id: '20' }, { tags: ['alpine', '22-alpine'], v: '22.9.0', base: 'alpine', size: 160000000, layers: 6, age: 12, id: 'alpine' }, { tags: ['20-alpine'], v: '20.18.0', base: 'alpine', size: 138000000, layers: 6, age: 30, id: '20alpine' }] });
def('python', { base: 'debian', entrypoint: [], cmd: ['python3'], exposed: [], behavior: 'none',
  env: v => ['PATH=/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin', 'LANG=C.UTF-8', 'PYTHON_VERSION=' + v.v],
  variants: [{ tags: ['latest', '3', '3.13', '3.13.0'], v: '3.13.0', size: 1020000000, layers: 9, age: 8 }, { tags: ['3.12', '3.12.7'], v: '3.12.7', size: 1020000000, layers: 9, age: 20, id: '312' }, { tags: ['3.12-slim', 'slim'], v: '3.12.7', size: 130000000, layers: 5, age: 20, id: '312slim' }, { tags: ['alpine', '3.12-alpine'], v: '3.12.7', base: 'alpine', size: 78500000, layers: 5, age: 20, id: '312alpine' }] });

/* résout repo:tag → spec complète (ou null) */
NS.registryLookup = function (repo, tag) {
  const r = R[repo]; if (!r) return null;
  const v = r.variants.find(x => x.tags.includes(tag)); if (!v) return null;
  const base = v.base || r.base; const key = repo + ':' + v.v + ':' + (v.id || 'std');
  const layers = []; layers.push('base:' + base + ':' + (base === 'alpine' ? '3.20' : base === 'ubuntu' ? '24.04' : base === 'debian' ? '12' : base === 'busybox' ? '1.37' : 'scratch'));
  for (let i = 1; i < v.layers; i++) layers.push(key + ':' + i);
  return {
    repo, tag, key, base, version: v.v, size: v.size, ageDays: v.age,
    id: U.hexOf('img:' + key, 64), digest: 'sha256:' + U.hexOf('digest:' + key, 64),
    layerIds: layers.map(l => U.hexOf('layer:' + l, 12)),
    layerSizes: layers.map((l, i) => i === 0 ? Math.round(v.size * 0.4) : Math.round(v.size * 0.6 / Math.max(1, layers.length - 1))),
    config: { entrypoint: r.entrypoint.slice(), cmd: r.cmd.slice(), env: typeof r.env === 'function' ? r.env(v) : r.env.slice(), exposed: r.exposed.slice(), workdir: r.workdir || '', volumes: (r.volumes || []).slice(), stopSignal: r.stopSignal || 'SIGTERM' },
    behavior: r.behavior || 'none', svc: r.svc || null,
  };
};
NS.registryTags = repo => { const r = R[repo]; if (!r) return null; const o = []; r.variants.forEach(v => v.tags.forEach(t => o.push(t))); return o; };

/* ------------------------------------------------ « Internet » minimal */
NS.INTERNET = {
  'example.com': { ip: '93.184.215.14', body: '<!doctype html>\n<html>\n<head>\n    <title>Example Domain</title>\n</head>\n<body>\n<div>\n    <h1>Example Domain</h1>\n    <p>This domain is for use in illustrative examples in documents. You may use this\n    domain in literature without prior coordination or asking for permission.</p>\n    <p><a href="https://www.iana.org/domains/example">More information...</a></p>\n</div>\n</body>\n</html>\n' },
  'google.com': { ip: '142.250.74.46', body: '<!doctype html><html><head><title>Google</title></head><body>Google</body></html>' },
  'github.com': { ip: '140.82.121.3', body: '<!doctype html><html><head><title>GitHub</title></head><body>GitHub</body></html>' },
  'docker.com': { ip: '18.205.93.2', body: '<!doctype html><html><head><title>Docker</title></head><body>Docker</body></html>' },
  'dns.google': { ip: '8.8.8.8', body: '' },
};
NS.INTERNET_IPS = { '8.8.8.8': 'dns.google', '1.1.1.1': 'one.one.one.one' };

/* ------------------------------------------------ comportements des services */
const B = NS.BEHAVIORS = {};
const ct = p => /\.html?$/.test(p) ? 'text/html' : /\.css$/.test(p) ? 'text/css' : /\.js$/.test(p) ? 'application/javascript' : /\.json$/.test(p) ? 'application/json' : /\.txt$/.test(p) ? 'text/plain' : /\.png$/.test(p) ? 'image/png' : 'application/octet-stream';

/* serveur de fichiers statiques commun à nginx / httpd */
function serveStatic(c, lab, req, o) {
  const fs = c.fs; let path = fs.norm('/', decodeURIComponent((req.path || '/').split('?')[0]));
  let full = o.docroot + (path === '/' ? '' : path);
  const dirReq = fs.isDir(full);
  if (dirReq) { const idx = o.index.find(i => fs.isFile(full + '/' + i)); if (idx) full = full + '/' + idx; else return { status: 403, err: 'dir', full: full + '/' }; }
  const body = fs.read(full);
  if (body === null) return { status: 404, err: 'missing', full };
  return { status: 200, body, ctype: ct(full), full };
}
B.none = {};
B.hello = { oneshot: true, run() { return { out: '\nHello from Docker!\nThis message shows that your installation appears to be working correctly.\n\nTo generate this message, Docker took the following steps:\n 1. The Docker client contacted the Docker daemon.\n 2. The Docker daemon pulled the "hello-world" image from the Docker Hub.\n    (amd64)\n 3. The Docker daemon created a new container from that image which runs the\n    executable that produces the output you are currently reading.\n 4. The Docker daemon streamed that output to the Docker client, which sent it\n    to your terminal.\n\nTo try something more ambitious, you can run an Ubuntu container with:\n $ docker run -it ubuntu bash\n\nShare images, automate workflows, and more with a free Docker ID:\n https://hub.docker.com/\n\nFor more examples and ideas, visit:\n https://docs.docker.com/get-started/\n\n', code: 0 }; } };

B.nginx = {
  listen: [80], docroot: '/usr/share/nginx/html', handlesTerm: true,
  seedFs(fs, spec) {
    fs.writep('/usr/share/nginx/html/index.html', '<!DOCTYPE html>\n<html>\n<head>\n<title>Welcome to nginx!</title>\n<style>\nhtml { color-scheme: light dark; }\nbody { width: 35em; margin: 0 auto;\nfont-family: Tahoma, Verdana, Arial, sans-serif; }\n</style>\n</head>\n<body>\n<h1>Welcome to nginx!</h1>\n<p>If you see this page, the nginx web server is successfully installed and\nworking. Further configuration is required.</p>\n\n<p>For online documentation and support please refer to\n<a href="http://nginx.org/">nginx.org</a>.<br/>\nCommercial support is available at\n<a href="http://nginx.com/">nginx.com</a>.</p>\n\n<p><em>Thank you for using nginx.</em></p>\n</body>\n</html>\n');
    fs.writep('/usr/share/nginx/html/50x.html', '<!DOCTYPE html>\n<html>\n<head>\n<title>Error</title>\n</head>\n<body>\n<h1>An error occurred.</h1>\n</body>\n</html>\n');
    fs.writep('/etc/nginx/nginx.conf', 'user  nginx;\nworker_processes  auto;\n\nerror_log  /var/log/nginx/error.log notice;\npid        /var/run/nginx.pid;\n\nevents {\n    worker_connections  1024;\n}\n\nhttp {\n    include       /etc/nginx/mime.types;\n    default_type  application/octet-stream;\n    access_log  /var/log/nginx/access.log  main;\n    sendfile        on;\n    keepalive_timeout  65;\n    include /etc/nginx/conf.d/*.conf;\n}\n');
    fs.writep('/etc/nginx/conf.d/default.conf', 'server {\n    listen       80;\n    listen  [::]:80;\n    server_name  localhost;\n\n    location / {\n        root   /usr/share/nginx/html;\n        index  index.html index.htm;\n    }\n\n    error_page   500 502 503 504  /50x.html;\n    location = /50x.html {\n        root   /usr/share/nginx/html;\n    }\n}\n');
    fs.mkdirp('/var/log/nginx');
  },
  boot(c, lab, spec) {
    const v = spec.version; const t = () => U.nginxError(lab.wall());
    const L = [[0, '/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration'], [10, '/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/'], [20, '/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh'], [30, '10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf'], [40, '10-listen-on-ipv6-by-default.sh: info: Enabled listen on IPv6 in /etc/nginx/conf.d/default.conf'], [50, '/docker-entrypoint.sh: Sourcing /docker-entrypoint.d/15-local-resolvers.envsh'], [60, '/docker-entrypoint.sh: Launching /docker-entrypoint.d/20-envsubst-on-templates.sh'], [70, '/docker-entrypoint.sh: Launching /docker-entrypoint.d/30-tune-worker-processes.sh'], [80, '/docker-entrypoint.sh: Configuration complete; ready for start up']];
    const n = [() => t() + ' [notice] 1#1: using the "epoll" event method', () => t() + ' [notice] 1#1: nginx/' + v, () => t() + ' [notice] 1#1: built by gcc 12.2.0 (Debian 12.2.0-14)', () => t() + ' [notice] 1#1: OS: Linux 6.8.0-45-generic', () => t() + ' [notice] 1#1: getrlimit(RLIMIT_NOFILE): 1048576:1048576', () => t() + ' [notice] 1#1: start worker processes', () => t() + ' [notice] 1#1: start worker process 29'];
    n.forEach((f, i) => L.push([90 + i * 2, f]));
    return { lines: L, readyAt: 100, procs: ['nginx: master process nginx -g daemon off;', 'nginx: worker process'] };
  },
  stopLines(c, lab) { const t = U.nginxError(lab.wall()); return ['\n' + t + ' [notice] 1#1: signal 3 (SIGQUIT) received, shutting down', t + ' [notice] 29#29: gracefully shutting down', t + ' [notice] 29#29: exiting', t + ' [notice] 29#29: exit', t + ' [notice] 1#1: signal 17 (SIGCHLD) received from 29', t + ' [notice] 1#1: worker process 29 exited with code 0', t + ' [notice] 1#1: exit'].map(x => x.replace(/^\n/, '')); },
  http(c, lab, req) {
    const v = c.spec.version; const r = serveStatic(c, lab, req, { docroot: this.docroot, index: ['index.html', 'index.htm'] });
    const hdr = { Server: 'nginx/' + v, Date: U.httpDate(lab.wall()), 'Content-Type': 'text/html', Connection: 'keep-alive' };
    let res;
    if (r.status === 200) { res = { status: 200, reason: 'OK', headers: Object.assign(hdr, { 'Content-Type': r.ctype, 'Content-Length': String(r.body.length), 'Last-Modified': 'Tue, 01 Oct 2024 12:00:00 GMT', ETag: '"' + U.hexOf(r.full + r.body.length, 8) + '-' + r.body.length.toString(16) + '"', 'Accept-Ranges': 'bytes' }), body: r.body }; }
    else { const s = r.status, nm = s === 403 ? 'Forbidden' : 'Not Found'; const body = '<html>\r\n<head><title>' + s + ' ' + nm + '</title></head>\r\n<body>\r\n<center><h1>' + s + ' ' + nm + '</h1></center>\r\n<hr><center>nginx/' + v + '</center>\r\n</body>\r\n</html>\r\n'; res = { status: s, reason: nm, headers: Object.assign(hdr, { 'Content-Length': String(body.length) }), body }; }
    if (r.status === 403) lab.log(c, U.nginxError(lab.wall()) + ' [error] 29#29: *' + (++c.hits) + ' directory index of "' + r.full + '" is forbidden, client: ' + req.from + ', server: localhost, request: "' + req.method + ' ' + req.path + ' HTTP/1.1", host: "' + (req.host || 'localhost') + '"');
    if (r.status === 404) lab.log(c, U.nginxError(lab.wall()) + ' [error] 29#29: *' + (++c.hits) + ' open() "' + r.full + '" failed (2: No such file or directory), client: ' + req.from + ', server: localhost, request: "' + req.method + ' ' + req.path + ' HTTP/1.1", host: "' + (req.host || 'localhost') + '"');
    lab.log(c, req.from + ' - - [' + U.nginxAccess(lab.wall()) + '] "' + req.method + ' ' + req.path + ' HTTP/1.1" ' + res.status + ' ' + (req.method === 'HEAD' ? 0 : res.body.length) + ' "-" "' + (req.ua || 'curl/8.5.0') + '" "-"');
    return res;
  },
};

B.httpd = {
  listen: [80], docroot: '/usr/local/apache2/htdocs', handlesTerm: true,
  seedFs(fs) { fs.writep('/usr/local/apache2/htdocs/index.html', '<html><body><h1>It works!</h1></body></html>\n'); fs.writep('/usr/local/apache2/conf/httpd.conf', 'ServerRoot "/usr/local/apache2"\nListen 80\nDocumentRoot "/usr/local/apache2/htdocs"\n'); fs.mkdirp('/usr/local/apache2/logs'); },
  boot(c, lab, spec) {
    const ip = (Object.values(c.nets)[0] || {}).ip || '127.0.0.1'; const w = () => U.apacheTime(lab.wall());
    const msg = 'AH00558: httpd: Could not reliably determine the server\'s fully qualified domain name, using ' + ip + '. Set the \'ServerName\' directive globally to suppress this message';
    return { lines: [[0, msg], [5, msg], [10, () => '[' + w() + '] [mpm_event:notice] [pid 1:tid 1] AH00489: Apache/' + spec.version + ' (Unix) configured -- resuming normal operations'], [12, () => '[' + w() + '] [core:notice] [pid 1:tid 1] AH00094: Command line: \'httpd -D FOREGROUND\'']], readyAt: 12, procs: ['httpd -DFOREGROUND', 'httpd -DFOREGROUND'] };
  },
  stopLines(c, lab) { return ['[' + U.apacheTime(lab.wall()) + '] [mpm_event:notice] [pid 1:tid 1] AH00491: caught SIGTERM, shutting down']; },
  http(c, lab, req) {
    const v = c.spec.version; const r = serveStatic(c, lab, req, { docroot: this.docroot, index: ['index.html'] });
    const hdr = { Date: U.httpDate(lab.wall()), Server: 'Apache/' + v + ' (Unix)' };
    let res;
    if (r.status === 200) res = { status: 200, reason: 'OK', headers: Object.assign(hdr, { 'Last-Modified': 'Mon, 11 Jun 2007 18:53:14 GMT', ETag: '"' + r.body.length.toString(16) + '-432a5e4a73a80"', 'Accept-Ranges': 'bytes', 'Content-Length': String(r.body.length), 'Content-Type': r.ctype }), body: r.body };
    else if (r.status === 403) { const body = '<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">\n<html><head>\n<title>403 Forbidden</title>\n</head><body>\n<h1>Forbidden</h1>\n<p>You don\'t have permission to access this resource.</p>\n</body></html>\n'; res = { status: 403, reason: 'Forbidden', headers: Object.assign(hdr, { 'Content-Length': String(body.length), 'Content-Type': 'text/html; charset=iso-8859-1' }), body }; }
    else { const body = '<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">\n<html><head>\n<title>404 Not Found</title>\n</head><body>\n<h1>Not Found</h1>\n<p>The requested URL was not found on this server.</p>\n</body></html>\n'; res = { status: 404, reason: 'Not Found', headers: Object.assign(hdr, { 'Content-Length': String(body.length), 'Content-Type': 'text/html; charset=iso-8859-1' }), body }; }
    lab.log(c, req.from + ' - - [' + U.nginxAccess(lab.wall()) + '] "' + req.method + ' ' + req.path + ' HTTP/1.1" ' + res.status + ' ' + (req.method === 'HEAD' ? '-' : res.body.length));
    return res;
  },
};

B.redis = {
  listen: [6379], handlesTerm: true, noHttp: true,
  seedFs(fs) { fs.mkdirp('/data'); },
  boot(c, lab, spec, args) {
    const t = () => U.redisTime(lab.wall()); const v = spec.version; const loaded = c.fs.isFile('/data/dump.rdb');
    const L = [[0, () => '1:C ' + t() + ' # WARNING Memory overcommit must be enabled! Without it, a background save or replication may fail under low memory condition. Being disabled, it can also cause failures without low memory condition, see https://github.com/jemalloc/jemalloc/issues/1328. To fix this issue add \'vm.overcommit_memory = 1\' to /etc/sysctl.conf and then reboot or run the command \'sysctl vm.overcommit_memory=1\' for this to take effect.'], [2, () => '1:C ' + t() + ' * oO0OoO0OoO0Oo Redis is starting oO0OoO0OoO0Oo'], [4, () => '1:C ' + t() + ' * Redis version=' + v + ', bits=64, commit=00000000, modified=0, pid=1, just started'], [6, () => '1:C ' + t() + ' # Warning: no config file specified, using the default config. In order to specify a config file use redis-server /path/to/redis.conf'], [8, () => '1:M ' + t() + ' * monotonic clock: POSIX clock_gettime'], [10, () => '1:M ' + t() + ' * Running mode=standalone, port=6379.'], [12, () => '1:M ' + t() + ' * Server initialized']];
    if (loaded) L.push([14, () => '1:M ' + t() + ' * Loading RDB produced by version ' + v], [15, () => '1:M ' + t() + ' * DB loaded from disk: 0.001 seconds']);
    L.push([16, () => '1:M ' + t() + ' * Ready to accept connections tcp']);
    return { lines: L, readyAt: 16, procs: ['redis-server *:6379'], onReady() { const raw = c.fs.read('/data/dump.rdb'); try { c.redis = raw ? JSON.parse(raw.replace(/^REDIS0011\n/, '')) : {}; } catch (e) { c.redis = {}; } } };
  },
  stopLines(c, lab) { const t = U.redisTime(lab.wall()); c.fs.write('/data/dump.rdb', 'REDIS0011\n' + JSON.stringify(c.redis || {})); return ['1:signal-handler (' + Math.floor(lab.wall() / 1000) + ') Received SIGTERM scheduling shutdown...', '1:M ' + t + ' * User requested shutdown...', '1:M ' + t + ' * Saving the final RDB snapshot before exiting.', '1:M ' + t + ' * DB saved on disk', '1:M ' + t + ' # Redis is now ready to exit, bye bye...']; },
};

B.postgres = {
  listen: [5432], handlesTerm: true, noHttp: true,
  seedFs(fs) { fs.mkdirp('/var/lib/postgresql/data'); },
  boot(c, lab, spec) {
    const env = c.envMap(); const t = () => U.pgTime(lab.wall()); const v = spec.version; const pgdata = env.PGDATA || '/var/lib/postgresql/data';
    if (!c.fs.isFile(pgdata + '/PG_VERSION')) {
      if (!env.POSTGRES_PASSWORD && env.POSTGRES_HOST_AUTH_METHOD !== 'trust') {
        return { fail: 1, lines: [[0, 'Error: Database is uninitialized and superuser password is not specified.\n       You must specify POSTGRES_PASSWORD to a non-empty value for the\n       superuser. For example, "-e POSTGRES_PASSWORD=password" on "docker run".\n\n       You may also use "POSTGRES_HOST_AUTH_METHOD=trust" to allow all\n       connections without a password. This is *not* recommended.\n\n       See PostgreSQL documentation about "trust":\n       https://www.postgresql.org/docs/current/auth-trust.html']] };
      }
      const L = [[0, 'The files belonging to this database system will be owned by user "postgres".\nThis user must also own the server process.\n\nThe database cluster will be initialized with locale "en_US.utf8".\nThe default database encoding has accordingly been set to "UTF8".\nThe default text search configuration will be set to "english".\n\nData page checksums are disabled.\n\nfixing permissions on existing directory ' + pgdata + ' ... ok\ncreating subdirectories ... ok\nselecting dynamic shared memory implementation ... posix\nselecting default "max_connections" ... 100\nselecting default "shared_buffers" ... 128MB\nselecting default time zone ... Etc/UTC\ncreating configuration files ... ok\nrunning bootstrap script ... ok\nperforming post-bootstrap initialization ... ok\nsyncing data to disk ... ok\n\n\nSuccess. You can now start the database server using:\n\n    pg_ctl -D ' + pgdata + ' -l logfile start\n\nwaiting for server to start....'],
        [60, () => t() + ' [48] LOG:  starting PostgreSQL ' + v + ' (Debian ' + v + '-1.pgdg120+1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 12.2.0-14) 12.2.0, 64-bit'], [62, () => t() + ' [48] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"'], [70, () => t() + ' [51] LOG:  database system was shut down at ' + t()], [75, () => t() + ' [48] LOG:  database system is ready to accept connections'],
        [80, ' done\nserver started'], [85, env.POSTGRES_DB && env.POSTGRES_DB !== 'postgres' ? 'CREATE DATABASE' : ''], [90, '\n/usr/local/bin/docker-entrypoint.sh: ignoring /docker-entrypoint-initdb.d/*\n'], [95, () => t() + ' [48] LOG:  received fast shutdown request'], [100, 'waiting for server to shut down....' + '' + ' done\nserver stopped'], [110, '\nPostgreSQL init process complete; ready for start up.\n'],
        [120, () => t() + ' [1] LOG:  starting PostgreSQL ' + v + ' (Debian ' + v + '-1.pgdg120+1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 12.2.0-14) 12.2.0, 64-bit'], [122, () => t() + ' [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432'], [124, () => t() + ' [1] LOG:  listening on IPv6 address "::", port 5432'], [126, () => t() + ' [1] LOG:  listening on Unix socket "/var/run/postgresql/.s.PGSQL.5432"'], [140, () => t() + ' [64] LOG:  database system was shut down at ' + t()], [150, () => t() + ' [1] LOG:  database system is ready to accept connections']].filter(l => l[1] !== '');
      return { lines: L, readyAt: 150, procs: ['postgres', 'postgres: checkpointer', 'postgres: background writer', 'postgres: walwriter'], onReady() { c.fs.write(pgdata + '/PG_VERSION', spec.config && v.split('.')[0] + '\n'); c.fs.write(pgdata + '/postgresql.conf', '# PostgreSQL configuration file\nlisten_addresses = \'*\'\nmax_connections = 100\n'); c.fs.mkdirp(pgdata + '/base'); c.fs.mkdirp(pgdata + '/global'); c.fs.write(pgdata + '/PG_VERSION', v.split('.')[0] + '\n'); } };
    }
    return { lines: [[0, '\nPostgreSQL Database directory appears to contain a database; Skipping initialization\n'], [30, () => t() + ' [1] LOG:  starting PostgreSQL ' + v + ' (Debian ' + v + '-1.pgdg120+1) on x86_64-pc-linux-gnu, compiled by gcc (Debian 12.2.0-14) 12.2.0, 64-bit'], [32, () => t() + ' [1] LOG:  listening on IPv4 address "0.0.0.0", port 5432'], [34, () => t() + ' [1] LOG:  listening on IPv6 address "::", port 5432'], [60, () => t() + ' [29] LOG:  database system was shut down at ' + t()], [80, () => t() + ' [1] LOG:  database system is ready to accept connections']], readyAt: 80, procs: ['postgres', 'postgres: checkpointer', 'postgres: background writer', 'postgres: walwriter'] };
  },
  stopLines(c, lab) { const t = U.pgTime(lab.wall()); return [t + ' [1] LOG:  received fast shutdown request', t + ' [1] LOG:  aborting any active transactions', t + ' [1] LOG:  background worker "logical replication launcher" (PID 30) exited with exit code 1', t + ' [25] LOG:  shutting down', t + ' [1] LOG:  database system is shut down']; },
};

B.mysql = {
  listen: [3306], handlesTerm: true, noHttp: true,
  seedFs(fs) { fs.mkdirp('/var/lib/mysql'); },
  boot(c, lab, spec) {
    const env = c.envMap(); const t = () => U.iso(lab.wall()).replace(/\d{6}Z$/, '000Z').replace(/(\.\d{3})000Z/, '$1Z'); const v = spec.version; const maria = spec.repo === 'mariadb'; const ok = !!(env.MYSQL_ROOT_PASSWORD || env.MYSQL_ALLOW_EMPTY_PASSWORD || env.MYSQL_RANDOM_ROOT_PASSWORD || env.MARIADB_ROOT_PASSWORD || env.MARIADB_ALLOW_EMPTY_ROOT_PASSWORD || env.MARIADB_RANDOM_ROOT_PASSWORD);
    const first = !c.fs.isFile('/var/lib/mysql/auto.cnf') && !c.fs.isDir('/var/lib/mysql/mysql');
    const P = maria ? 'MARIADB' : 'MYSQL';
    if (first && !ok) return { fail: 1, lines: [[0, () => t() + ' 0 [Note] [Entrypoint]: Entrypoint script for MySQL Server ' + v + '-1.el9 started.'], [5, () => t() + ' 0 [ERROR] [Entrypoint]: Database is uninitialized and password option is not specified\n    You need to specify one of the following as an environment variable:\n    - ' + P + '_ROOT_PASSWORD\n    - ' + P + '_ALLOW_EMPTY_PASSWORD\n    - ' + P + '_RANDOM_ROOT_PASSWORD']] };
    const L = [[0, () => t() + ' 0 [Note] [Entrypoint]: Entrypoint script for MySQL Server ' + v + '-1.el9 started.']];
    if (first) L.push([20, () => t() + ' 0 [Note] [Entrypoint]: Initializing database files'], [60, () => t() + ' 0 [System] [MY-015017] [Server] MySQL Server Initialization - start.'], [90, () => t() + ' 0 [System] [MY-015018] [Server] MySQL Server Initialization - end.'], [100, () => t() + ' 0 [Note] [Entrypoint]: Database files initialized']);
    L.push([120, () => t() + ' 0 [System] [MY-010116] [Server] /usr/sbin/mysqld (mysqld ' + v + ') starting as process 1'], [140, () => t() + ' 0 [System] [MY-010931] [Server] /usr/sbin/mysqld: ready for connections. Version: \'' + v + '\'  socket: \'/var/run/mysqld/mysqld.sock\'  port: 3306  MySQL Community Server - GPL.']);
    return { lines: L, readyAt: 140, procs: ['mysqld'], onReady() { c.fs.write('/var/lib/mysql/auto.cnf', '[auto]\nserver-uuid=' + U.hexOf(c.id, 8) + '\n'); c.fs.mkdirp('/var/lib/mysql/mysql'); } };
  },
  stopLines(c, lab) { const t = U.iso(lab.wall()); return [t + ' 0 [System] [MY-013172] [Server] Received SHUTDOWN from user <via user signal>. Shutting down mysqld.', t + ' 0 [System] [MY-010910] [Server] /usr/sbin/mysqld: Shutdown complete.']; },
};
})(typeof window !== 'undefined' ? window : globalThis);
