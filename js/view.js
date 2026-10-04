/* view.js — vue graphique : hôte, réseaux Docker (bandes), conteneurs (cartes), ports publiés, volumes */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const { h, clear } = NS;
const COL = { running: '#16a34a', exited: '#94a3b8', created: '#d97706', paused: '#2563eb', restarting: '#dc2626' };
const CW = 176, CH = 86, GAP = 14, PAD = 14, HEAD = 34;

NS.createView = function (lab, root, hooks) {
  hooks = hooks || {};
  const svg = h('svg:svg#view', { xmlns: 'http://www.w3.org/2000/svg', role: 'img', 'aria-label': 'Schéma de l\'hôte Docker : réseaux, conteneurs, ports et volumes' });
  root.appendChild(svg);
  let sel = null, raf = 0; const api = { sel: () => sel };
  const S = (tag, attrs, ...kids) => h('svg:' + tag, attrs, ...kids);
  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

  function containersOf(net) {
    return lab.containers.filter(c => {
      if (net.name === 'host') return c.host.network === 'host';
      if (net.name === 'none') return c.host.network === 'none';
      return c.nets[net.name] !== undefined && c.host.network !== 'host' && c.host.network !== 'none';
    });
  }
  function draw() {
    raf = 0; clear(svg);
    const W = Math.max(root.clientWidth - 2, 640); const perRow = Math.max(1, Math.floor((W - 2 * PAD - 20) / (CW + GAP)));
    let y = 8; const pos = new Map();
    const layer = S('g'); const lines = S('g'); const top = S('g'); svg.appendChild(layer); svg.appendChild(lines); svg.appendChild(top);
    /* --- hôte et ports publiés --- */
    const pubs = []; lab.containers.forEach(c => { if (c.running && c._bound) c._bound.forEach(b => { if (b.hostPort && !pubs.some(p => p.c === c && p.b.hostPort === b.hostPort && p.b.proto === b.proto)) pubs.push({ c, b }); }); });
    const hostH = 52 + (pubs.length ? 34 : 0);
    layer.appendChild(S('g.band.host', S('rect.bg', { x: 6, y, width: W - 12, height: hostH, rx: 8 }), S('rect.strip', { x: 6, y, width: 6, height: hostH, rx: 3 }),
      S('text.bt', { x: 22, y: y + 20 }, 'Hôte — student@' + lab.hostname), S('text.bs', { x: 22, y: y + 36 }, 'Ubuntu 24.04 · le démon Docker tourne ici · 127.0.0.1 / 172.17.0.1')));
    const hostBadgeY = y + 52; let bx = 22; const badgePos = [];
    pubs.forEach(p => {
      const label = (p.b.ip && p.b.ip !== '0.0.0.0' ? p.b.ip + ':' : ':') + p.b.hostPort + (p.b.proto === 'udp' ? '/udp' : '');
      const w = label.length * 6.8 + 16;
      const gb = S('g.pbadge', { 'data-port': p.b.hostPort, onclick: () => hooks.openBrowser && hooks.openBrowser('http://localhost:' + p.b.hostPort) }, S('title', 'Port ' + p.b.hostPort + ' de l\'hôte → ' + p.c.name + ':' + p.b.port + ' — clic : ouvrir dans le navigateur'), S('rect', { x: bx, y: hostBadgeY, width: w, height: 22, rx: 11 }), S('text', { x: bx + 8, y: hostBadgeY + 15 }, label));
      top.appendChild(gb); badgePos.push({ p, x: bx + w / 2, y: hostBadgeY + 22 }); bx += w + 8;
    });
    y += hostH + 10;
    /* --- bandes réseau --- */
    const nets = lab.networks.slice().sort((a, b) => (a.builtin === b.builtin ? 0 : a.builtin ? -1 : 1));
    const show = nets.filter(n => (n.name !== 'host' && n.name !== 'none') || containersOf(n).length);
    show.forEach(n => {
      const cs = containersOf(n); const rows = Math.max(1, Math.ceil(cs.length / perRow)); const bh = HEAD + rows * (CH + GAP) - (cs.length ? 0 : CH - 20) + 4;
      const cls = n.name === 'host' ? 'hostnet' : n.name === 'none' ? 'none' : n.builtin ? 'bridgeb' : 'user';
      const info = n.name === 'host' ? 'réseau de l\'hôte (pas d\'isolation)' : n.name === 'none' ? 'aucun réseau' : n.driver + ' · ' + n.subnet + ' · passerelle ' + n.gateway + (n.builtin ? ' · pas de DNS interne' : ' · DNS interne par nom');
      layer.appendChild(S('g.band.' + cls, S('rect.bg', { x: 6, y, width: W - 12, height: bh, rx: 8 }), S('rect.strip', { x: 6, y, width: 6, height: bh, rx: 3 }), S('text.bt', { x: 22, y: y + 17 }, 'Réseau « ' + n.name + ' »'), S('text.bs', { x: 22, y: y + 30 }, info)));
      if (!cs.length) layer.appendChild(S('text.bs', { x: W - 150, y: y + 17 }, '(aucun conteneur)'));
      cs.forEach((c, i) => {
        const cx = PAD + 10 + (i % perRow) * (CW + GAP), cy = y + HEAD + Math.floor(i / perRow) * (CH + GAP);
        if (!pos.has(c)) pos.set(c, { x: cx, y: cy });
        top.appendChild(card(c, cx, cy, n));
      });
      y += bh + 10;
    });
    /* --- volumes --- */
    const vols = lab.volumes;
    if (vols.length) {
      const per = Math.max(1, Math.floor((W - 2 * PAD) / 190)); const rows = Math.ceil(vols.length / per); const bh = HEAD - 6 + rows * 40 + 6;
      layer.appendChild(S('g.band.vol', S('rect.bg', { x: 6, y, width: W - 12, height: bh, rx: 8 }), S('rect.strip', { x: 6, y, width: 6, height: bh, rx: 3 }), S('text.bt', { x: 22, y: y + 17 }, 'Volumes'), S('text.bs', { x: 100, y: y + 17 }, 'données gérées par Docker (/var/lib/docker/volumes) — elles survivent à la suppression des conteneurs')));
      vols.forEach((v, i) => {
        const vx = PAD + 10 + (i % per) * 190, vy = y + HEAD - 6 + Math.floor(i / per) * 40;
        const users = lab.containers.filter(c => c.mounts.some(m => m.type === 'volume' && m.name === v.name));
        const nm = v.anonymous ? v.name.slice(0, 12) + '…' : v.name;
        top.appendChild(S('g.vcard', S('title', v.name + (users.length ? ' — utilisé par : ' + users.map(u => u.name).join(', ') : ' — non utilisé')), S('rect', { x: vx, y: vy, width: 178, height: 32, rx: 6 }), S('text', { x: vx + 8, y: vy + 14 }, '🗄 ' + trunc(nm, 20)), S('text', { x: vx + 8, y: vy + 26, style: 'font-size:10px' }, users.length ? '→ ' + trunc(users.map(u => u.name).join(', '), 22) : 'aucun conteneur')));
      });
      y += bh + 10;
    }
    if (!lab.containers.length && !lab.images.length) top.appendChild(S('text.empty-view', { x: 24, y: y + 24 }, 'Aucun conteneur pour l\'instant. Tapez par exemple : docker run -d --name web -p 8080:80 nginx'));
    /* --- traits ports → conteneurs --- */
    badgePos.forEach(bp => { const p = pos.get(bp.p.c); if (!p) return; const x2 = p.x + CW / 2, y2 = p.y; const my = (bp.y + y2) / 2; lines.appendChild(S('path.pline', { d: 'M' + bp.x + ' ' + bp.y + ' C ' + bp.x + ' ' + my + ', ' + x2 + ' ' + my + ', ' + x2 + ' ' + y2 })); });
    svg.setAttribute('width', W); svg.setAttribute('height', y + 6);
  }
  function card(c, x, y, net) {
    const st = c.state.status; const dim = st === 'exited' || st === 'created';
    const ip = (c.nets[net.name] || {}).ip || (net.name === 'host' ? '(réseau de l\'hôte)' : '');
    const ports = lab.portsText(c).split(', ').filter(p => p.includes('->') && !p.startsWith('[::]')).map(p => p.replace('0.0.0.0:', '').replace('/tcp', '')).join(' ');
    const mt = c.mounts.map(m => (m.type === 'bind' ? '📁' : '🗄') + (m.type === 'bind' ? m.source.split('/').pop() : m.name.slice(0, 8)) + ':' + m.destination).join(' ');
    const multi = c.netList().length > 1 && net.name !== 'host' ? ' (+' + (c.netList().length - 1) + ' réseau)' : '';
    return S('g.ccard' + (dim ? '.dim' : '') + (sel === c.name ? '.sel' : ''), { tabindex: 0, role: 'button', 'aria-label': 'Conteneur ' + c.name + ', ' + st, 'data-name': c.name, onclick: () => { sel = c.name; api.refresh(); hooks.select && hooks.select(c.name); }, onkeydown: e => { if (e.key === 'Enter') e.target.dispatchEvent(new Event('click')); } },
      S('title', c.name + ' — ' + lab.statusText(c)),
      S('rect.card', { x, y, width: CW, height: CH, rx: 8 }), S('circle', { cx: x + 13, cy: y + 15, r: 5.5, fill: COL[st] || '#94a3b8' }),
      S('text.nm', { x: x + 24, y: y + 19 }, trunc(c.name, 20)), S('text.im', { x: x + 10, y: y + 34 }, trunc(c.imageRef, 24)),
      S('text.ip', { x: x + 10, y: y + 48 }, trunc(ip || '—', 24) + (multi ? '' : '')), S('text.st', { x: x + 10, y: y + 62 }, trunc(lab.statusText(c) + multi, 30)),
      S('text.mt', { x: x + 10, y: y + 76 }, trunc(ports ? '⇄ ' + ports : mt, 30)));
  }
  api.refresh = function () { if (!raf) raf = (g.requestAnimationFrame || setTimeout)(draw); };
  api.select = n => { sel = n; api.refresh(); };
  const off = lab.on(api.refresh); g.addEventListener('resize', api.refresh);
  api.destroy = () => { off(); g.removeEventListener('resize', api.refresh); };
  draw();
  return api;
};
})(typeof window !== 'undefined' ? window : globalThis);
