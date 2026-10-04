/* main.js — démarrage : laboratoire, barre d'outils, dock, inspecteur, TP, fichiers, aide */
(function () {
'use strict';
const NS = window.NS; const { h, $, $$, clear, ui } = NS;
const LS = 'dockerlab.v1';
let lab = null, view = null, resPane = null, evPane = null, filesPane = null, currentTp = null, selName = null, loopT = null;
const terms = []; let activeTerm = -1; let termN = 0;
const S = { running: true, speed: 1 };

/* ------------------------------------------------ cycle de vie du laboratoire */
function mount(newLab, tp) {
  if (loopT) clearInterval(loopT);
  if (view) view.destroy(); ui.closeAllWindows();
  lab = newLab; currentTp = tp || null; selName = null; terms.length = 0; activeTerm = -1; termN = 0;
  clear($('#viewwrap')); clear($('#pane-term')); clear($('#pane-res')); clear($('#pane-events')); clear($('#pane-files'));
  view = NS.createView(lab, $('#viewwrap'), { select: n => { selName = n; renderInspector(); showRight('insp'); }, openBrowser: u => NS.openBrowser(lab, u) });
  resPane = NS.createResources(lab, $('#pane-res')); evPane = NS.createEvents(lab, $('#pane-events')); filesPane = NS.createFiles(lab, $('#pane-files'));
  buildTerminals(); lab.on(() => { renderInspector(); scheduleSave(); });
  renderInspector(); renderTp(); startLoop();
}
function freshLab(tp) {
  const l = new NS.Lab({ epoch: Date.UTC(2026, 9, 4, 7, 38, 0), seed: (Math.random() * 1e9) | 0 });
  if (tp && tp.build) tp.build(l);
  return l;
}
NS.installHostEditor(() => lab);

/* ------------------------------------------------ terminaux (onglets) */
function buildTerminals() {
  const wrap = h('div.termwrap'); const tabs = h('div.termtabs'); const body = h('div.termbody'); wrap.appendChild(tabs); wrap.appendChild(body); $('#pane-term').appendChild(wrap);
  function draw() {
    clear(tabs);
    terms.forEach((t, i) => tabs.appendChild(h('button.ttab' + (i === activeTerm ? '.on' : ''), { onclick: () => select(i) }, t.name, terms.length > 1 ? h('span.x', { title: 'Fermer ce terminal', onclick: e => { e.stopPropagation(); closeTerm(i); } }, '×') : null)));
    tabs.appendChild(h('button.small', { title: 'Ouvrir un nouveau terminal (utile pour « docker logs -f » pendant que vous tapez ailleurs)', onclick: () => add() }, '+ Terminal'));
    clear(body); if (terms[activeTerm]) { body.appendChild(terms[activeTerm].api.el); }
  }
  function select(i) { activeTerm = i; draw(); terms[i].api.focus(); }
  function add(initial) {
    const sess = initial || new NS.HostSession(lab); const t = { name: 'Terminal ' + (++termN), api: null };
    t.api = NS.Terminal(sess, { onIdle: () => { }, onRun: () => { } }); terms.push(t); activeTerm = terms.length - 1; draw(); t.api.focus(); return t;
  }
  function closeTerm(i) { const t = terms[i]; try { t.api.session.abort(); } catch (e) { } terms.splice(i, 1); activeTerm = Math.min(activeTerm, terms.length - 1); draw(); }
  buildTerminals.add = add;
  /* sessions déjà présentes (restauration) puis au moins une */
  lab.sessions.forEach(s => add(s)); if (!terms.length) add(); select(0);
  clear($('#palette')); NS.createCheat($('#palette'), () => terms[activeTerm] && terms[activeTerm].api);
}
const termApi = () => terms[activeTerm] && terms[activeTerm].api;

/* ------------------------------------------------ temps simulé (boucle d'horloge) */
function startLoop() {
  let last = performance.now();
  loopT = setInterval(() => {
    const now = performance.now(), dt = Math.min(now - last, 250); last = now;
    $('#simtime').textContent = 't = ' + fmtT(lab.clock.now);
    if (!S.running) return;
    const mult = S.speed * (lab.turbo > 0 ? 6 : 1);
    try { lab.clock.runFor(dt * mult); } catch (e) { console.error(e); }
  }, 50);
}
function fmtT(ms) { const s = Math.floor(ms / 1000); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; }
const spd = $('#speed');
function setSpeed() { S.speed = Math.pow(100, spd.value / 100) / Math.pow(100, 0.3); const v = S.speed; $('#speedv').textContent = '×' + (v < 10 ? (Math.round(v * 10) / 10) : Math.round(v)); }
spd.addEventListener('input', setSpeed); setSpeed();
$('#btn-run').addEventListener('click', () => { S.running = !S.running; $('#btn-run').textContent = S.running ? '⏸ Pause' : '▶ Lecture'; $('#btn-run').classList.toggle('on', !S.running); });
$('#btn-t1').addEventListener('click', () => { lab.clock.runFor(60000); lab.changed(); ui.toast('Temps simulé avancé d\'une minute', 'info', 1500); });
$('#btn-why').addEventListener('click', () => NS.showWhy(lab));
$('#btn-browser').addEventListener('click', () => NS.openBrowser(lab));
$('#btn-fit').addEventListener('click', () => { $('#viewwrap').scrollTo(0, 0); view.refresh(); });

/* ------------------------------------------------ dock / volet droit */
function dockShow(tab) { $$('.dtab').forEach(b => b.classList.toggle('on', b.dataset.dock === tab)); ['term', 'res', 'files', 'events'].forEach(k => { $('#pane-' + k).style.display = k === tab ? '' : 'none'; }); $('#dock').classList.remove('min'); $('#dockmin').textContent = '▾'; if (tab === 'term' && termApi()) termApi().focus(); if (tab === 'files') filesPane.refresh(); }
$$('.dtab').forEach(b => b.addEventListener('click', () => dockShow(b.dataset.dock)));
$('#dockmin').addEventListener('click', () => { const d = $('#dock'); d.classList.toggle('min'); $('#dockmin').textContent = d.classList.contains('min') ? '▴' : '▾'; });
$('#dockmax').addEventListener('click', () => { const d = $('#dock'); d.classList.remove('min'); const big = d.dataset.big === '1'; d.style.height = big ? '' : Math.round(innerHeight * 0.72) + 'px'; d.dataset.big = big ? '0' : '1'; });
(function grip() { const gp = $('#dockgrip'), dock = $('#dock'); let y0 = null, h0 = 0; gp.addEventListener('mousedown', e => { y0 = e.clientY; h0 = dock.offsetHeight; e.preventDefault(); }); window.addEventListener('mousemove', e => { if (y0 === null) return; dock.style.height = Math.max(120, Math.min(innerHeight - 200, h0 + (y0 - e.clientY))) + 'px'; }); window.addEventListener('mouseup', () => { y0 = null; }); })();
$$('.rtab').forEach(b => b.addEventListener('click', () => { $$('.rtab').forEach(x => x.classList.toggle('on', x === b)); $('#inspector').style.display = b.dataset.r === 'insp' ? '' : 'none'; $('#tppane').style.display = b.dataset.r === 'tp' ? '' : 'none'; }));
const showRight = r => $$('.rtab').find(b => b.dataset.r === r).click();

/* ------------------------------------------------ inspecteur */
function renderInspector() {
  const box = $('#inspector'); clear(box); const c = selName && lab.getContainer(selName);
  if (!c) {
    selName = null;
    const run = lab.containers.filter(x => x.running).length;
    box.appendChild(h('div.insp-empty', h('h3', 'Propriétés'), h('p.muted', 'Cliquez un conteneur dans le schéma pour voir ses détails et agir dessus (chaque bouton écrit la vraie commande dans le terminal).'),
      h('table.kv', h('tr', h('th', 'Conteneurs'), h('td', lab.containers.length + ' (' + run + ' en cours)')), h('tr', h('th', 'Images'), h('td', String(lab.images.length))), h('tr', h('th', 'Volumes'), h('td', String(lab.volumes.length))), h('tr', h('th', 'Réseaux'), h('td', String(lab.networks.length)))),
      h('p.small.muted', 'Astuce : le bouton « 💡 Pourquoi ? » en haut explique la dernière commande.')));
    return;
  }
  const st = c.state.status; const cmd = (x) => () => { const t = termApi(); dockShow('term'); if (t) t.runLines(x); };
  const pub = (c._bound || []).filter(b => b.hostPort);
  box.appendChild(h('div', h('h3', { style: { margin: '0 0 4px' } }, c.name), h('span.pill.' + st, st), h('span.small.muted', { style: { marginLeft: '6px' } }, lab.statusText(c)),
    h('div.btns.insp-btns', c.running ? [h('button', { onclick: cmd('docker stop ' + c.name) }, '■ Arrêter'), h('button', { onclick: cmd('docker restart ' + c.name) }, '↻ Redémarrer'), h('button', { onclick: cmd('docker logs ' + c.name) }, 'Journaux'), h('button', { onclick: cmd('docker exec -it ' + c.name + ' sh') }, '⌨ Shell')] : [h('button', { onclick: cmd('docker start ' + c.name) }, '▶ Démarrer'), h('button', { onclick: cmd('docker logs ' + c.name) }, 'Journaux')],
      pub.length ? h('button', { onclick: () => NS.openBrowser(lab, 'http://localhost:' + pub[0].hostPort) }, '🌐 Ouvrir') : null,
      h('button', { onclick: cmd('docker rm ' + (c.running ? '-f ' : '') + c.name) }, '🗑 Supprimer')),
    h('table.kv', [['Image', c.imageRef], ['ID', c.shortId], ['Commande', c.displayCmd() || '—'], ['Réseaux', c.netList().map(n => n + (c.nets[n].ip ? ' (' + c.nets[n].ip + ')' : '')).join(', ') || '—'], ['Ports', lab.portsText(c) || '—'], ['Redémarrage', c.host.restart.name + (c.restartCount ? '' : '')],
      ['Variables', c.config.env.filter(e => !/^(PATH|NGINX_VERSION|PKG_RELEASE|NJS|HOME|HOSTNAME|TERM)=/.test(e)).join('\n') || '—'], ['Montages', c.mounts.map(m => (m.type === 'bind' ? '📁 ' + m.source : '🗄 ' + m.name) + ' → ' + m.destination + (m.rw ? '' : ' (ro)')).join('\n') || '—']].map(([k, v]) => h('tr', h('th', k), h('td.mono', { style: { whiteSpace: 'pre-wrap', fontSize: '11.5px' } }, v)))),
    h('p.small.muted', 'Pour tout voir : ', h('code', 'docker inspect ' + c.name))));
}

/* ------------------------------------------------ sauvegarde */
let saveT = null;
function scheduleSave() { if (saveT) return; saveT = setTimeout(() => { saveT = null; autosave(); }, 4000); }
function snapshot() { return NS.snapshotLab(lab, { tp: currentTp ? currentTp.id : null }); }
function autosave() { try { if (lab.journal.length || currentTp) localStorage.setItem(LS, JSON.stringify(snapshot())); } catch (e) { } }
window.addEventListener('beforeunload', autosave);
function loadData(d, quiet) {
  try { const tp = SCbyId(d.tp); const l = NS.restoreLab(d, tp && tp.build ? tp.build : null); mount(l, tp); if (!quiet) ui.toast('Laboratoire chargé', 'ok'); }
  catch (e) { ui.toast('Fichier invalide : ' + e.message, 'err'); console.error(e); }
}
$('#btn-new').addEventListener('click', () => { const go = () => { mount(freshLab()); try { localStorage.removeItem(LS); } catch (e) { } }; if (lab.journal.length) ui.confirmBox('Nouveau laboratoire', 'Effacer tout (conteneurs, images, volumes, fichiers) ? Le laboratoire courant est sauvegardé dans ce navigateur, mais pas exporté.', go); else go(); });
let saveHandle = null;
async function saveAs(force) {
  const data = JSON.stringify(snapshot());
  if (window.showSaveFilePicker) {
    try { const handle = (!force && saveHandle) ? saveHandle : await window.showSaveFilePicker({ suggestedName: 'dockerlab.json', types: [{ description: 'Docker Lab (JSON)', accept: { 'application/json': ['.json'] } }] }); const w = await handle.createWritable(); await w.write(data); await w.close(); saveHandle = handle; ui.toast('Enregistré (' + handle.name + ')', 'ok'); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const a = h('a', { href: URL.createObjectURL(new Blob([data], { type: 'application/json' })), download: 'dockerlab.json' }); document.body.appendChild(a); a.click(); a.remove(); ui.toast('Enregistré (dockerlab.json)', 'ok');
}
$('#btn-save').addEventListener('click', () => saveAs(false));
$('#btn-save').addEventListener('contextmenu', e => { e.preventDefault(); saveAs(true); });
$('#btn-open').addEventListener('click', () => $('#filein').click());
$('#filein').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { loadData(JSON.parse(r.result)); } catch (x) { ui.toast('Fichier illisible', 'err'); } }; r.readAsText(f); e.target.value = ''; });

/* ------------------------------------------------ TP */
const SCbyId = id => (NS.SCENARIOS || []).find(s => s.id === id) || null;
const DIFF_LABEL = { 1: 'Facile', 2: 'Intermédiaire', 3: 'Avancé' };
const diffStars = n => '★'.repeat(n || 1) + '☆'.repeat(3 - (n || 1));
const diffText = n => diffStars(n) + ' ' + (DIFF_LABEL[n] || DIFF_LABEL[1]);
function startScenario(sc, force) {
  const go = () => { try { mount(freshLab(sc), sc); } catch (e) { ui.toast('Erreur de construction du TP : ' + e.message, 'err'); console.error(e); return; } showRight('tp'); autosave(); ui.toast('TP chargé : ' + sc.title, 'ok'); };
  if (!force && lab.journal.length) ui.confirmBox('Charger un TP', 'Le laboratoire actuel sera remplacé. Continuer ?', go); else go();
}
function tpBody(sc) {
  if (!sc.parts) return [h('h4', 'Déroulé'), h('ol', (sc.steps || []).map(s => h('li', { html: s })))];
  let n = 0; const out = [];
  sc.parts.forEach((p, pi) => {
    out.push(h('div.tpart', h('h4.ptitle', 'Partie ' + (pi + 1) + ' — ' + p.title),
      h('details.course', { open: true }, h('summary', '📘 Apport de cours'), (p.course || []).map(c => h('p', { html: c }))),
      p.steps.map(st => { n++;
        return h('div.tstep', h('div.sn', 'Étape ' + n), h('div.st', { html: st.t }),
          st.why ? h('div.why', h('b', 'Pourquoi ? '), h('span', { html: st.why })) : null,
          st.see ? h('div.see', h('b', 'Vous devriez voir : '), h('span', { html: st.see })) : null,
          st.opts && st.opts.length ? h('details.opts', h('summary', 'Décryptage de la commande'), h('ul', st.opts.map(o => h('li', h('code', o[0]), ' : ', h('span', { html: o[1] }))))) : null);
      })));
  });
  if (sc.recap && sc.recap.length) out.push(h('div.recap', h('h4', '🎯 À retenir'), h('ul', sc.recap.map(r => h('li', { html: r })))));
  return out;
}
function renderTp() {
  const box = $('#tppane'); clear(box); const sc = currentTp;
  if (!sc) { box.appendChild(h('div', h('h3', 'Aucun TP chargé'), h('p.muted', 'Utilisez « TP d\'exemple » en haut de l\'écran pour charger un sujet avec son cours, ses étapes expliquées, une correction et des vérifications automatiques.'))); return; }
  const res = h('div.tpres');
  const wide = h('button.small', { title: 'Élargir / réduire le volet', onclick: () => { const r = $('#right'); r.classList.toggle('wide'); try { localStorage.setItem('dockerlab.wide', r.classList.contains('wide') ? '1' : ''); } catch (e) { } } }, '↔ Élargir');
  box.appendChild(h('div.tp', h('h3', sc.title), h('span.lvl', sc.level + ' · ' + sc.duration + ' · ' + diffText(sc.diff)), ' ', wide, h('p', sc.desc),
    h('h4', 'Objectifs'), h('ul', sc.objectives.map(o => h('li', o))), ...tpBody(sc),
    h('p.small.muted', '💡 Cliquez sur une commande du sujet pour l\'écrire dans le terminal (Maj+clic : l\'exécuter).'),
    h('div.btns', h('button.primary', { onclick: () => { res.textContent = 'Vérification en cours…'; setTimeout(() => runChecks(sc, res), 20); } }, '✔ Vérifier mon travail'),
      sc.solve ? h('button', { onclick: () => ui.confirmBox('Correction', 'Appliquer la correction ? Elle sera exécutée dans le terminal à votre place.', () => { sc.solve(lab, termApi()); ui.toast('Correction appliquée', 'ok'); }) }, 'Charger la correction') : null,
      h('button', { onclick: () => ui.confirmBox('Recommencer', 'Repartir de l\'état de départ du TP ? Votre travail sera perdu.', () => startScenario(sc, true)) }, 'Recommencer')), res));
}
try { if (localStorage.getItem('dockerlab.wide')) $('#right').classList.add('wide'); } catch (e) { }
/* les commandes du sujet (balises <code>) s'insèrent dans le terminal d'un clic */
$('#tppane').addEventListener('click', e => {
  const c = e.target.closest && e.target.closest('code'); if (!c || !c.closest('.tp') || c.closest('.btns')) return;
  const t = c.textContent.trim(); if (!/^[a-z~./]/.test(t) || window.getSelection().toString()) return;
  const tm = termApi(); if (!tm) return; dockShow('term'); if (e.shiftKey) tm.runLines(t); else tm.insert(t);
});
function runChecks(sc, res) {
  clear(res); const c = NS.checker(lab); let okN = 0;
  sc.checks.forEach(k => { let ok = false; try { ok = !!k.run(c); } catch (e) { console.error(e); } if (ok) okN++; res.appendChild(h('div.check', { style: { borderColor: ok ? '#86efac' : '#fca5a5' } }, (ok ? '✔ ' : '✖ ') + k.label)); });
  res.insertBefore(h('p', { style: { fontWeight: 600, color: okN === sc.checks.length ? '#166534' : '#92400e' } }, okN + ' / ' + sc.checks.length + ' vérifications réussies'), res.firstChild);
}
$('#btn-scen').addEventListener('click', () => {
  const list = NS.SCENARIOS || []; const cats = []; list.forEach(sc => { const c = sc.cat || 'Docker'; if (!cats.includes(c)) cats.push(c); });
  const catSel = h('select', cats.map(c => h('option', { value: c }, c))); const tpSel = h('select'); const info = h('div.tp-preview');
  function fillTp() { clear(tpSel); list.filter(sc => (sc.cat || 'Docker') === catSel.value).forEach(sc => tpSel.appendChild(h('option', { value: sc.id }, diffStars(sc.diff) + ' ' + sc.title))); updateInfo(); }
  function updateInfo() { const sc = SCbyId(tpSel.value); clear(info); if (sc) info.appendChild(h('p.muted', h('b', diffText(sc.diff) + ' · ' + sc.level + ' · ' + sc.duration), h('br'), sc.desc)); }
  catSel.addEventListener('change', fillTp); tpSel.addEventListener('change', updateInfo); fillTp();
  ui.modal('TP d\'exemple', [ui.field('Section', catSel), ui.field('Sujet', tpSel), info], [{ label: 'Annuler' }, { label: 'Charger', primary: true, fn: () => { const sc = SCbyId(tpSel.value); if (sc) startScenario(sc); } }]);
});

/* ------------------------------------------------ aide */
function helpModal() {
  const cov = NS.COVERAGE || { rows: [], note: '', sources: [] }; const ST = { ok: ['✔ simulé', 'st-ok'], part: ['◐ partiel', 'st-part'], no: ['○ prévu', 'st-no'] };
  const t = ui.tabs([
    { id: 'use', label: 'Prise en main', render: () => h('div', { style: { maxWidth: '760px', padding: '8px 12px' } },
      h('h4', 'Principe'), h('p', 'Docker Lab simule un hôte Docker complet dans votre navigateur : aucune installation, aucun serveur. Les commandes, leurs sorties et leurs messages d\'erreur reproduisent ceux de Docker.'),
      h('h4', 'Utiliser le terminal'), h('ul', h('li', 'Tapez des commandes comme dans un vrai terminal : Tab complète, ↑ rappelle l\'historique, Ctrl+C interrompt, Ctrl+L efface, Ctrl+D quitte un shell.'), h('li', 'Avec « docker run -it … » ou « docker exec -it … », vous êtes DANS le conteneur : l\'invite change. Tapez « exit » pour revenir à l\'hôte.'), h('li', 'Le bouton « + Terminal » ouvre un second terminal (pratique pour « docker logs -f »).'), h('li', 'L\'aide-mémoire à gauche écrit la commande à votre place (Maj+clic pour l\'exécuter).')),
      h('h4', 'Lire le schéma'), h('ul', h('li', 'Chaque bande est un réseau Docker ; une carte est un conteneur (point vert = en cours, gris = arrêté, orange = créé).'), h('li', 'Les pastilles jaunes en haut sont les ports de l\'hôte publiés ; cliquez-en une pour ouvrir le navigateur.'), h('li', 'Cliquez une carte : le volet de droite montre les détails et propose des actions.')),
      h('h4', 'Le temps'), h('p', 'Le temps est simulé : les démarrages, arrêts (10 s de délai avant SIGKILL), redémarrages et journaux suivent une horloge que vous pouvez accélérer ou mettre en pause.'),
      h('h4', 'TP'), h('p', 'Le menu « TP d\'exemple » charge un sujet. Le bouton « Vérifier mon travail » contrôle l\'état du laboratoire (pas les commandes tapées) : plusieurs chemins mènent au résultat.')) },
    { id: 'lim', label: 'Limites connues', render: () => h('div', { style: { maxWidth: '760px', padding: '8px 12px' } }, h('p', 'Docker Lab est un simulateur pédagogique : il ne lance aucun vrai programme. Ce qui est volontairement approché :'),
      h('ul', (NS.LIMITS || []).map(x => h('li', x)))) },
    { id: 'cov', label: 'Couverture du programme', render: () => h('div', { style: { padding: '8px 12px' } }, h('p.muted', cov.note),
      h('table.cov', h('tr', h('th', 'Thème'), h('th', 'État'), h('th', 'TP'), h('th', 'Remarque')), cov.rows.map(r => h('tr', h('td', r[0]), h('td', { class: ST[r[1]][1] }, ST[r[1]][0]), h('td', r[2]), h('td', r[3])))),
      h('p.small', 'Références : ', (cov.sources || []).map(s => h('span', h('a', { href: s[1], target: '_blank', rel: 'noopener' }, s[0]), ' · ')))) },
  ]);
  ui.modal('Aide — Docker Lab', t, [{ label: 'Fermer', primary: true }]);
}
$('#btn-help').addEventListener('click', helpModal);

/* ------------------------------------------------ démarrage */
(function boot() {
  let saved = null; try { saved = JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { }
  let ok = false;
  if (saved) { try { const tp = SCbyId(saved.tp); mount(NS.restoreLab(saved, tp && tp.build ? tp.build : null), tp); ok = true; } catch (e) { console.error(e); } }
  if (!ok) { mount(freshLab()); setTimeout(() => ui.toast('Bienvenue ! Essayez : docker run -d --name web -p 8080:80 nginx — ou chargez un TP.', 'info', 6000), 400); }
  window.__lab = () => lab;
})();
})();
