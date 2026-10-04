/* scenarios.js — TP intégrés : état de départ (build), correction (solve), vérifications (checks), couverture et limites */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};
const SC = NS.SCENARIOS = [];

/* ------------------------------------------------ exécution « silencieuse » de commandes (préparation des TP, corrections, tests) */
NS.execLines = function (lab, lines) {
  const was = lab.replaying; lab.replaying = true; const n = lab.sessions.length;
  const s = new NS.HostSession(lab); let out = '';
  try {
    for (const l of lines) {
      let done = false; const io = { print: t => { out += t; }, done: () => { done = true; }, clear() { } };
      s.exec(l, io); if (!done) lab.clock.runUntil(() => done, 120000); if (!done) s.abort(); lab.clock.runFor(1500);
    }
  } finally { lab.sessions.length = n; lab.replaying = was; }
  return out;
};
/* correction : dans l'interface, les commandes sont tapées dans le terminal ; sans terminal (tests), elles sont exécutées en silence */
const solveWith = NS.solveWith = lines => (lab, term) => { if (term) term.runLines(lines); else NS.execLines(lab, lines); };

/* helpers de rédaction des TP : P = partie (cours + étapes), S = étape (consigne, pourquoi, résultat attendu, décryptage des options) */
NS.tpP = (title, course, steps) => ({ title, course, steps });
NS.tpS = (t, why, see, opts) => ({ t, why, see, opts });

/* ------------------------------------------------ vérificateur : questions posées à l'état du laboratoire */
NS.checker = function (lab) {
  const c = {
    lab,
    get: n => lab.getContainer(n),
    exists: n => !!lab.getContainer(n),
    running: n => { const x = lab.getContainer(n); return !!x && x.state.status === 'running'; },
    status: n => { const x = lab.getContainer(n); return x ? x.state.status : null; },
    exitCode: n => { const x = lab.getContainer(n); return x ? x.state.exitCode : null; },
    image: ref => !!lab.findImage(ref),
    imageOf: n => { const x = lab.getContainer(n); return x ? x.imageRef.replace(/:latest$/, '') : null; },
    published: (n, hostPort, cport) => { const x = lab.getContainer(n); return !!x && x.running && (x._bound || []).some(b => b.hostPort === hostPort && b.port === cport); },
    env: (n, k) => { const x = lab.getContainer(n); return x ? (x.envMap()[k] === undefined ? null : x.envMap()[k]) : null; },
    restart: n => { const x = lab.getContainer(n); return x ? x.host.restart.name : null; },
    mountsVolume: (n, vol, dest) => { const x = lab.getContainer(n); return !!x && x.mounts.some(m => m.type === 'volume' && m.name === vol && (!dest || m.destination === dest)); },
    mountsBind: (n, dest) => { const x = lab.getContainer(n); return !!x && x.mounts.some(m => m.type === 'bind' && m.destination === dest); },
    volume: n => !!lab.getVolume(n),
    network: n => !!lab.getNetwork(n),
    onNet: (n, net) => { const x = lab.getContainer(n); return !!x && x.nets[net] !== undefined && !!x.nets[net].ip; },
    reach: (a, b) => { const x = lab.getContainer(a), y = lab.getContainer(b); return !!x && !!y && x.running && y.running && lab.canReach(x, y); },
    http(url, from) { const r = lab.httpFetch(from ? lab.getContainer(from) : null, url, {}); return r.err ? { ok: false, status: 0, body: '', err: r.err.msg } : { ok: r.res.status < 400, status: r.res.status, body: r.res.body || '' }; },
    hostFile: p => lab.hostFs.read(p),
    logs: n => { const x = lab.getContainer(n); return x ? x.logs.map(l => l.text).join('\n') : ''; },
    img: ref => lab.findImage(ref),
    imgFile: (ref, p) => { const i = lab.findImage(ref); return i ? new NS.VFS(i.fs).read(p) : null; },
    imgPkg: (ref, p) => { const i = lab.findImage(ref); return !!i && !!(i.pkgs || {})[p]; },
    lastBuild: () => lab.lastBuild || null,
    inContainer: (n, p) => { const x = lab.getContainer(n); return x ? x.fs.read(p) : null; },
    count: kind => kind === 'containers' ? lab.containers.length : kind === 'running' ? lab.containers.filter(x => x.running).length : kind === 'exited' ? lab.containers.filter(x => x.state.status === 'exited' || x.state.status === 'created').length : kind === 'volumes' ? lab.volumes.length : kind === 'images' ? lab.images.length : 0,
    unusedVolumes: () => lab.volumes.filter(v => !lab.containers.some(x => x.mounts.some(m => m.name === v.name))).length,
    unusedImages: () => lab.images.filter(i => !lab.containers.some(x => x.imageId === i.id)).length,
  };
  return c;
};

/* ================================================= Couverture et limites */
NS.COVERAGE = {
  note: 'Ce tableau décrit ce que Docker Lab simule et les TP qui s\'y rapportent. Il n\'établit pas de correspondance officielle avec un référentiel : c\'est au formateur de situer chaque notion dans sa progression.',
  rows: [
    ['Client / démon, version, info', 'ok', 'Première rencontre', 'Valeurs de version indicatives'],
    ['Images : pull, images, rmi, tag, inspect', 'ok', 'Première rencontre, Nettoyage', 'Catalogue de 13 images ; couches partagées simulées'],
    ['Conteneurs : run, ps, stop, start, restart, kill, rm', 'ok', 'Cycle de vie, Dépannage', ''],
    ['Journaux, exec, inspect, top, stats, cp', 'ok', 'Cycle de vie, Dépannage, Volumes', 'Messages de services scriptés (nginx, httpd, redis, postgres, mysql)'],
    ['Shell interactif (-it), commandes de base', 'ok', 'Réseaux Docker, Isolation', 'Mini-shell : pas de scripts complexes'],
    ['Publication de ports, conflits', 'ok', 'Cycle de vie, Ports et variables', 'Port déjà alloué : le conteneur reste « Created »'],
    ['Variables d\'environnement (-e)', 'ok', 'Ports et variables, Dépannage', ''],
    ['Politiques de redémarrage', 'ok', 'Dépannage', 'Délai croissant simulé'],
    ['Volumes nommés / anonymes', 'ok', 'Volumes', 'Initialisation depuis l\'image au premier montage'],
    ['Bind mounts, lecture seule', 'ok', 'Bind mount', 'Écriture hôte limitée à /home/student et /tmp'],
    ['Réseaux : bridge, réseaux utilisateur, DNS embarqué, host, none', 'ok', 'Réseaux Docker, Isolation', 'Pas de perte de paquets ni de latence réaliste'],
    ['Nettoyage : prune, system df', 'ok', 'Nettoyage', ''],
    ['Dockerfile : FROM, COPY, RUN, ENV, ARG, WORKDIR, CMD, ENTRYPOINT, EXPOSE, USER, LABEL, VOLUME', 'ok', 'Dockerfile, RUN-ENV-CMD, Cache', 'ONBUILD, ADD d\'une URL et RUN --mount non gérés'],
    ['docker build : -t, -f, --build-arg, --no-cache, --target, -q, cache de couches, multi-étapes, .dockerignore', 'ok', 'Dockerfile, Cache', 'Sorties BuildKit imitées ; durées simulées'],
    ['docker history, docker commit', 'ok', 'Dockerfile', 'Historique des images du catalogue : indicatif'],
    ['Docker Compose', 'no', '—', 'Prévu (phase suivante)'],
    ['Registres privés, docker login/push', 'no', '—', 'Hors périmètre pour l\'instant'],
    ['Docker Swarm, Kubernetes', 'no', '—', 'Hors périmètre'],
  ],
  sources: [['Documentation Docker', 'https://docs.docker.com/'], ['Référence de la ligne de commande', 'https://docs.docker.com/reference/cli/docker/']],
};
NS.LIMITS = [
  'Aucun vrai programme n\'est exécuté : nginx, httpd, redis, postgres et mysql sont des comportements scriptés (journaux de démarrage, réponses HTTP, commandes redis-cli basiques).',
  'Seules les images du catalogue existent (hello-world, alpine, busybox, ubuntu, debian, nginx, httpd, redis, postgres, mysql, mariadb, node, python). Les tags, identifiants, digests et tailles sont indicatifs.',
  'Les sorties et messages d\'erreur imitent Docker 27 ; quelques messages rares ont été reconstitués de mémoire et peuvent différer d\'un mot ou d\'une ponctuation.',
  'docker build est simulé (cache de couches, multi-étapes, .dockerignore, ARG) mais les messages d\'erreur de build (Dockerfile absent, erreur de syntaxe, fichier COPY introuvable, image de base refusée) ont été écrits de mémoire. Les tailles de couches sont estimées, et l\'historique des images du catalogue est indicatif. RUN --mount, ONBUILD et ADD d\'une URL ne sont pas gérés. Pas de Docker Compose pour l\'instant, ni de docker login/push.',
  'Les programmes lancés par RUN et CMD sont ceux du mini-shell ; les interpréteurs python et node ne comprennent que les affichages (print, console.log), les variables d\'environnement et des variables simples. pip install et npm install sont simulés.',
  'Supprimer une image de base utilisée par une image construite ne provoque pas le conflit de dépendance de Docker.',
  'Le réseau est simplifié : adressage, isolation et DNS sont fidèles, mais pas la latence ni les pertes de paquets.',
  'Le mini-shell couvre l\'essentiel (pipes, redirections, $(…), jokers, variables) mais pas les scripts avancés (boucles, fonctions).',
  'L\'hôte simulé n\'autorise l\'écriture que dans /home/student et /tmp, et le temps est simulé (démarrages, arrêts et redémarrages suivent une horloge réglable).',
];
})(typeof window !== 'undefined' ? window : globalThis);
