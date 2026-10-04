/* panels.js — panneaux annexes : aide-mémoire, ressources, événements, fichiers de l'hôte, inspecteur, navigateur, « Pourquoi ? » */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const { h, clear, ui } = NS; const U = NS.U;

/* ------------------------------------------------ aide-mémoire (palette de gauche) */
NS.CHEAT = [
  ['Premiers pas', [
    ['docker version', 'versions du client et du démon'], ['docker info', 'état général du démon'], ['docker pull nginx', 'télécharge une image'], ['docker images', 'liste les images locales'],
    ['docker run hello-world', 'le « Hello World » de Docker']]],
  ['Lancer un conteneur', [
    ['docker run -d --name web -p 8080:80 nginx', 'arrière-plan, nom, port 8080→80'], ['docker run -it --name sh alpine', 'shell interactif (exit pour sortir)'], ['docker run --rm alpine echo bonjour', 'supprimé à la fin'],
    ['docker run -d --name db -e POSTGRES_PASSWORD=secret postgres', 'variable d\'environnement'], ['docker run -d --restart unless-stopped --name cache redis', 'politique de redémarrage']]],
  ['Gérer les conteneurs', [
    ['docker ps', 'conteneurs en cours'], ['docker ps -a', 'tous les conteneurs'], ['docker logs web', 'sortie du conteneur'], ['docker logs -f web', 'suivre (Ctrl+C pour quitter)'], ['docker exec -it web sh', 'ouvrir un shell dedans'],
    ['docker stop web', 'arrête proprement (SIGTERM)'], ['docker start web', 'redémarre un conteneur arrêté'], ['docker restart web', 'stop puis start'], ['docker kill web', 'arrêt immédiat (SIGKILL)'], ['docker rm web', 'supprime (arrêté)'], ['docker rm -f web', 'supprime même s\'il tourne'],
    ['docker inspect web', 'configuration détaillée (JSON)'], ['docker stats --no-stream', 'consommation'], ['docker top web', 'processus du conteneur'], ['docker port web', 'ports publiés'], ['docker cp web:/etc/hostname .', 'copie hôte ⇄ conteneur']]],
  ['Volumes et dossiers', [
    ['docker volume create data', 'crée un volume nommé'], ['docker volume ls', 'liste les volumes'], ['docker run -d --name pg -v data:/var/lib/postgresql/data -e POSTGRES_PASSWORD=x postgres', 'volume nommé'],
    ['docker run --rm -v "$PWD":/work alpine ls /work', 'montage d\'un dossier de l\'hôte'], ['docker volume inspect data', 'détails'], ['docker volume rm data', 'supprime'], ['docker volume prune', 'supprime les volumes inutilisés']]],
  ['Réseaux', [
    ['docker network ls', 'liste les réseaux'], ['docker network create mon-reseau', 'réseau bridge personnalisé'], ['docker run -d --name api --network mon-reseau nginx', 'attache au réseau'], ['docker network inspect mon-reseau', 'détails (sous-réseau, conteneurs)'],
    ['docker network connect mon-reseau web', 'branche un conteneur existant'], ['docker network disconnect mon-reseau web', 'débranche'], ['docker run --rm --network mon-reseau alpine ping -c 2 api', 'résolution par nom']]],
  ['Nettoyage', [
    ['docker rmi nginx', 'supprime une image'], ['docker container prune', 'supprime les conteneurs arrêtés'], ['docker image prune -a', 'supprime les images inutilisées'], ['docker system df', 'espace utilisé'], ['docker system prune', 'grand nettoyage']]],
  ['Dans le terminal', [
    ['curl http://localhost:8080', 'teste un service depuis l\'hôte'], ['nano index.html', 'éditeur de texte'], ['ls', 'liste les fichiers'], ['cat fichier', 'affiche un fichier'], ['mkdir site && cd site', 'crée un dossier']]],
];
NS.createCheat = function (root, term) {
  const q = h('input', { type: 'search', placeholder: 'Filtrer les commandes…', 'aria-label': 'Filtrer les commandes' });
  const box = h('div.cheat');
  function fill() {
    clear(box); const f = q.value.trim().toLowerCase();
    NS.CHEAT.forEach(([t, items], gi) => {
      const its = items.filter(([c, d]) => !f || (c + ' ' + d).toLowerCase().includes(f)); if (!its.length) return;
      box.appendChild(h('details', { open: f || gi < 2 }, h('summary', t), its.map(([c, d]) => h('button.cmd', { title: 'Clic : écrire dans le terminal · Maj+clic : exécuter', onclick: e => { const tm = term(); if (!tm) return; if (e.shiftKey) tm.runLines(c); else tm.insert(c); } }, c, h('small', d)))));
    });
  }
  q.addEventListener('input', fill); fill();
  root.appendChild(h('div', { style: { display: 'flex', flexDirection: 'column' } }, h('div.small.muted', { style: { marginBottom: '6px' } }, 'Aide-mémoire — cliquez pour écrire la commande dans le terminal (Maj+clic pour l\'exécuter).'), q, box));
};

/* ------------------------------------------------ ressources (images, volumes, réseaux) */
NS.createResources = function (lab, root) {
  const box = h('div.res'); root.appendChild(box); let raf = 0;
  function tbl(head, rows) { return h('table.tbl', h('tr', head.map(x => h('th', x))), rows.length ? rows.map(r => h('tr', r.map(x => h('td.mono', x)))) : h('tr', h('td', { colspan: head.length, style: { color: '#94a3b8' } }, '(aucun)'))); }
  function draw() {
    raf = 0; clear(box);
    box.appendChild(h('h4', 'Images (' + lab.images.length + ')'));
    box.appendChild(tbl(['Dépôt', 'Tag', 'ID', 'Taille', 'Couches', 'Utilisée par'], [].concat.apply([], lab.images.map(i => (i.refs.length ? i.refs : [{ repo: '<none>', tag: '<none>' }]).map(r => [r.repo, r.tag, i.id.slice(0, 12), U.humanSize(i.size), String(i.layers.length), lab.containers.filter(c => c.imageId === i.id).map(c => c.name).join(', ') || '—'])))));
    box.appendChild(h('h4', 'Volumes (' + lab.volumes.length + ')'));
    box.appendChild(tbl(['Nom', 'Pilote', 'Utilisé par', 'Fichiers'], lab.volumes.map(v => [v.anonymous ? v.name.slice(0, 16) + '…' : v.name, v.driver, lab.containers.filter(c => c.mounts.some(m => m.name === v.name)).map(c => c.name).join(', ') || '—', String(countFiles(v.vfs.root))])));
    box.appendChild(h('h4', 'Réseaux (' + lab.networks.length + ')'));
    box.appendChild(tbl(['Nom', 'Pilote', 'Sous-réseau', 'Passerelle', 'Conteneurs'], lab.networks.map(n => [n.name, n.driver, n.subnet || '—', n.gateway || '—', lab.containers.filter(c => c.nets[n.name] !== undefined || c.host.network === n.name).map(c => c.name).join(', ') || '—'])));
  }
  function countFiles(n) { return n.t === 'f' ? 1 : Object.values(n.c).reduce((a, x) => a + countFiles(x), 0); }
  const api = { refresh() { if (!raf) raf = setTimeout(draw, 50); } }; lab.on(api.refresh); draw(); return api;
};

/* ------------------------------------------------ événements (comme `docker events`) */
NS.createEvents = function (lab, root) {
  const box = h('div', { style: { height: '100%', overflow: 'auto', padding: '4px 0' } }); const bar = h('div.wsbar', h('button', { onclick: () => { lab.events.length = 0; seen = 0; clear(list); } }, 'Effacer'), h('span.muted', 'Événements du démon Docker (équivalent de « docker events »)'));
  const list = h('div'); box.appendChild(list); root.appendChild(h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' } }, bar, box));
  let seen = 0, raf = 0;
  function draw() {
    raf = 0; if (lab.events.length < seen) { seen = 0; clear(list); }
    for (; seen < lab.events.length; seen++) { const e = lab.events[seen]; const a = e.attrs || {}; const at = Object.keys(a).map(k => k + '=' + a[k]).join(', ');
      list.appendChild(h('div.evline', U.iso(e.t) + ' ' + e.type + ' ' + e.action + ' ' + String(e.id).slice(0, 12) + (at ? ' (' + at + ')' : ''))); }
    box.scrollTop = box.scrollHeight;
  }
  const api = { refresh() { if (!raf) raf = setTimeout(draw, 100); } }; lab.on(api.refresh); draw(); return api;
};

/* ------------------------------------------------ fichiers de l'hôte + éditeur */
NS.createFiles = function (lab, root) {
  const tree = h('div.ftree'); const ta = h('textarea', { spellcheck: 'false', 'aria-label': 'Contenu du fichier', placeholder: 'Choisissez un fichier à gauche, ou créez-en un.' }); const nameIn = h('input', { type: 'text', placeholder: '/home/student/nom.txt', style: { width: '260px' } });
  let cur = null;
  const save = () => { const p = nameIn.value.trim(); if (!p.startsWith('/')) return ui.toast('Chemin absolu requis (ex. /home/student/index.html)', 'warn'); if (!/^\/(home\/student|tmp)(\/|$)/.test(p)) return ui.toast('Écriture autorisée seulement dans /home/student et /tmp', 'warn'); lab.hostFs.writep(p, ta.value); NS.recordHostWrite(lab, p, ta.value); cur = p; ui.toast('Enregistré : ' + p, 'ok', 1500); draw(); };
  const bar = h('div.fbar', h('span.small.muted', 'Fichier :'), nameIn, h('button.primary.small', { onclick: save }, 'Enregistrer'), h('button.small', { onclick: () => { cur = null; nameIn.value = '/home/student/'; ta.value = ''; ta.focus(); } }, 'Nouveau'), h('span.small.muted', 'Les fichiers créés ici sont visibles dans le terminal (ls, cat) et montables dans les conteneurs.'));
  root.appendChild(h('div.files', tree, h('div.fedit', bar, ta)));
  function walk(n, path, depth, out) { Object.keys(n.c).sort().forEach(k => { const p = path + '/' + k; out.push({ p, k, d: depth, dir: n.c[k].t === 'd' }); if (n.c[k].t === 'd') walk(n.c[k], p, depth + 1, out); }); }
  function draw() {
    clear(tree); const out = [];
    ['/home/student', '/tmp'].forEach(r => { out.push({ p: r, k: r, d: 0, dir: true }); const n = lab.hostFs.get(r); if (n && n.t === 'd') walk(n, r, 1, out); });
    out.forEach(e => tree.appendChild(h('div.fitem' + (e.p === cur ? '.on' : ''), { style: { paddingLeft: (8 + e.d * 12) + 'px' }, onclick: () => { if (e.dir) { nameIn.value = e.p + '/'; return; } cur = e.p; nameIn.value = e.p; ta.value = lab.hostFs.read(e.p) || ''; draw(); } }, (e.dir ? '📁 ' : '📄 ') + e.k)));
  }
  const api = { refresh: draw, open(p) { cur = p; nameIn.value = p; ta.value = lab.hostFs.read(p) || ''; draw(); } }; lab.on(() => { clearTimeout(api._t); api._t = setTimeout(draw, 100); }); draw(); return api;
};
/* nano / vi / vim sur l'hôte : fenêtre d'édition ; le shell reste bloqué jusqu'à la fermeture */
NS.installHostEditor = function (getLab) {
  NS.hostEditor = function (st, arg) {
    const lab = getLab(); const fs = st.ctx.fs; const path = arg ? fs.norm(st.ctx.cwd, arg) : null;
    if (!path) { st.fail('Usage : nano <fichier>', 1); return; }
    if (fs.isDir(path)) { st.fail('nano: ' + arg + ' is a directory', 1); return; }
    const existed = fs.isFile(path); const ta = h('textarea.cfg', { spellcheck: 'false', style: { width: '100%', flex: 1, minHeight: '260px' } }); ta.value = fs.read(path) || '';
    let finished = false; const msg = h('span.small.muted', existed ? 'Fichier existant' : 'Nouveau fichier');
    const w = ui.openWindow({ title: 'GNU nano — ' + path, w: 640, h: 440, onClose: () => { if (!finished) { finished = true; st.done(0); } } });
    const doSave = () => { if (!/^\/(home\/student|tmp)(\/|$)/.test(path)) { msg.textContent = 'Erreur : écriture non autorisée ici (utilisez /home/student)'; return false; } fs.writep(path, ta.value); NS.recordHostWrite(lab, path, ta.value); msg.textContent = 'Enregistré (' + ta.value.split('\n').length + ' lignes)'; return true; };
    const quit = () => { w.close(); };
    ta.addEventListener('keydown', e => { if (e.ctrlKey && (e.key === 's' || e.key === 'o')) { e.preventDefault(); doSave(); } if (e.ctrlKey && e.key === 'x') { e.preventDefault(); if (doSave()) quit(); } });
    w.body.appendChild(h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, padding: '6px', gap: '6px' } }, ta, h('div.row', h('button.primary', { onclick: doSave }, 'Enregistrer (Ctrl+S)'), h('button', { onclick: () => { if (doSave()) quit(); } }, 'Enregistrer et quitter (Ctrl+X)'), h('button', { onclick: quit }, 'Quitter sans enregistrer'), msg)));
    setTimeout(() => ta.focus(), 30);
  };
};

/* ------------------------------------------------ navigateur web (depuis l'hôte) */
NS.openBrowser = function (lab, url) {
  const urlIn = h('input', { type: 'text', value: url || 'http://localhost:8080', 'aria-label': 'Adresse' }); const status = h('div.bstatus.small.muted');
  const frame = h('iframe.bframe', { sandbox: '', title: 'Page web' });
  function go() {
    let u = urlIn.value.trim(); if (!u) return; if (!/^https?:\/\//.test(u)) u = 'http://' + u; urlIn.value = u;
    const r = lab.httpFetch(null, u, { ua: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0' });
    if (r.err) { frame.srcdoc = '<body style="font:15px system-ui;padding:24px;color:#334155"><h2>Impossible de se connecter</h2><p>Le navigateur ne peut pas établir de connexion avec <b>' + NS.esc(u) + '</b>.</p><p style="color:#64748b">(' + NS.esc(r.err.msg) + ')</p><ul><li>Le conteneur est-il démarré ? <code>docker ps</code></li><li>Le port est-il publié avec <code>-p hôte:conteneur</code> ?</li></ul></body>'; status.textContent = 'Erreur : ' + r.err.msg; return; }
    const res = r.res; frame.srcdoc = res.body; status.textContent = 'HTTP ' + res.status + ' ' + res.reason + ' · ' + (res.body || '').length + ' octets' + (r.ip ? ' · serveur ' + r.ip : '');
    lab.changed();
  }
  urlIn.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  const w = ui.openWindow({ title: 'Navigateur web (hôte)', w: 620, h: 440, id: 'browser' });
  clear(w.body); w.body.appendChild(h('div.browser', h('div.urlbar', urlIn, h('button.primary', { onclick: go }, 'Aller'), h('button', { onclick: go, title: 'Recharger' }, '⟳')), frame, status));
  go(); return w;
};

/* ------------------------------------------------ « Pourquoi ? » */
NS.showWhy = function (lab) {
  const w = lab.lastWhy;
  if (!w) return ui.modal('Pourquoi ?', h('p', 'Tapez d\'abord une commande Docker (docker run, docker stop…), puis cliquez sur « Pourquoi ? » : le simulateur explique ce que le démon Docker vient de faire, étape par étape.'));
  ui.modal('Pourquoi ? — ' + w.title, h('div.whybox', h('ol', w.lines.map(l => h('li', l)))), [{ label: 'Fermer', primary: true }]);
};
})(typeof window !== 'undefined' ? window : globalThis);
