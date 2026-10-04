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
const solveWith = lines => (lab, term) => { if (term) term.runLines(lines); else NS.execLines(lab, lines); };

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
    inContainer: (n, p) => { const x = lab.getContainer(n); return x ? x.fs.read(p) : null; },
    count: kind => kind === 'containers' ? lab.containers.length : kind === 'running' ? lab.containers.filter(x => x.running).length : kind === 'exited' ? lab.containers.filter(x => x.state.status === 'exited' || x.state.status === 'created').length : kind === 'volumes' ? lab.volumes.length : kind === 'images' ? lab.images.length : 0,
    unusedVolumes: () => lab.volumes.filter(v => !lab.containers.some(x => x.mounts.some(m => m.name === v.name))).length,
    unusedImages: () => lab.images.filter(i => !lab.containers.some(x => x.imageId === i.id)).length,
  };
  return c;
};

const diag = (txt) => '<div class="hint2">' + txt + '</div>';

/* ================================================= Découverte */
SC.push({
  id: 'decouverte', diff: 1, cat: 'Découverte', level: 'Initiation', duration: '20 min', title: 'Première rencontre avec Docker',
  desc: 'Vérifier que Docker fonctionne, télécharger une image, lancer un premier conteneur et lire l\'état de l\'hôte.',
  objectives: ['Distinguer le client et le démon Docker', 'Différencier une image et un conteneur', 'Utiliser docker pull, run, images et ps'],
  steps: [
    'Affichez les versions avec <code>docker version</code> : il y a un <b>Client</b> (la commande que vous tapez) et un <b>Server</b> (le démon <code>dockerd</code> qui fait le travail).',
    'Téléchargez l\'image <b>alpine</b> : <code>docker pull alpine</code>. Une image est un modèle en lecture seule, formé de couches.',
    'Listez les images avec <code>docker images</code> : repérez le dépôt, le tag, l\'ID et la taille.',
    'Lancez le conteneur de test : <code>docker run hello-world</code>. Docker va chercher l\'image tout seul puisqu\'elle est absente.',
    'Listez <b>tous</b> les conteneurs : <code>docker ps -a</code>. Pourquoi « hello-world » est-il à l\'état <i>Exited (0)</i> ? (Cliquez sur « 💡 Pourquoi ? » après une commande pour comprendre.)',
    'Relancez <code>docker run alpine echo bonjour</code> puis <code>docker ps -a</code> : chaque <code>run</code> crée un <b>nouveau</b> conteneur à partir de la même image.'],
  build(lab) { },
  solve: solveWith(['docker version', 'docker pull alpine', 'docker images', 'docker run hello-world', 'docker run alpine echo bonjour', 'docker ps -a']),
  checks: [
    { label: 'L\'image alpine est présente localement', run: c => c.image('alpine') },
    { label: 'L\'image hello-world est présente localement (téléchargée par docker run)', run: c => c.image('hello-world') },
    { label: 'Un conteneur issu de hello-world s\'est terminé normalement (Exited (0))', run: c => c.lab.containers.some(x => x.imageRef.startsWith('hello-world') && x.state.status === 'exited' && x.state.exitCode === 0) },
    { label: 'Un conteneur alpine a exécuté « echo bonjour » (deux conteneurs distincts existent en tout)', run: c => c.lab.containers.some(x => x.imageRef.startsWith('alpine') && x.state.exitCode === 0) && c.count('containers') >= 2 },
  ],
});

SC.push({
  id: 'cycle-vie', diff: 1, cat: 'Découverte', level: 'Initiation', duration: '25 min', title: 'Le cycle de vie d\'un conteneur',
  desc: 'Démarrer, observer, arrêter, redémarrer et supprimer des conteneurs. Un ancien site tourne déjà sur le port 8080 : vous devez le remplacer.',
  objectives: ['Utiliser run -d, ps, logs, stop, start, rm', 'Comprendre les états Created / Up / Exited', 'Savoir pourquoi un nom ou un port est « déjà utilisé »'],
  steps: [
    'Observez l\'état de départ avec <code>docker ps -a</code> : un conteneur <b>test</b> tourne, un conteneur <b>ancien</b> est arrêté.',
    'Essayez de lancer un nouveau serveur : <code>docker run -d --name web -p 8080:80 nginx</code>. Lisez l\'erreur : le port 8080 est déjà pris par « test ». Que devient le conteneur « web » ? (<code>docker ps -a</code>)',
    'Arrêtez <b>test</b> : <code>docker stop test</code> (SIGTERM puis, au besoin, SIGKILL après 10 s).',
    'Supprimez le conteneur « web » raté, puis relancez-le : <code>docker rm web</code> puis <code>docker run -d --name web -p 8080:80 nginx</code>.',
    'Vérifiez avec <code>curl http://localhost:8080</code> et regardez les journaux : <code>docker logs web</code>.',
    'Faites le ménage : supprimez <b>test</b> et <b>ancien</b> avec <code>docker rm</code>. Seul <b>web</b> doit rester.'],
  build(lab) { NS.execLines(lab, ['docker run -d --name test -p 8080:80 nginx', 'docker run --name ancien alpine echo "ancienne version"']); },
  solve: solveWith(['docker stop test', 'docker rm web', 'docker run -d --name web -p 8080:80 nginx', 'curl http://localhost:8080', 'docker rm test ancien', 'docker ps -a']),
  checks: [
    { label: 'Le conteneur « web » tourne et publie 8080 → 80', run: c => c.running('web') && c.published('web', 8080, 80) },
    { label: 'http://localhost:8080 répond « Welcome to nginx! »', run: c => c.running('web') && c.http('http://localhost:8080').body.includes('Welcome to nginx!') },
    { label: 'Le conteneur « test » a été supprimé', run: c => !c.exists('test') },
    { label: 'Le conteneur « ancien » a été supprimé', run: c => !c.exists('ancien') },
    { label: 'Il ne reste qu\'un seul conteneur', run: c => c.count('containers') === 1 },
  ],
});

SC.push({
  id: 'nettoyage', diff: 1, cat: 'Découverte', level: 'Initiation', duration: '15 min', title: 'Faire le ménage sur un hôte encombré',
  desc: 'Un hôte Docker de développement déborde : conteneurs arrêtés, volumes oubliés, images inutilisées. Retrouvez de la place sans casser ce qui tourne.',
  objectives: ['Mesurer l\'occupation avec docker system df', 'Utiliser les commandes prune', 'Savoir ce qu\'un prune supprime… et ce qu\'il épargne'],
  steps: [
    'Mesurez avec <code>docker system df</code> puis listez <code>docker ps -a</code>, <code>docker volume ls</code>, <code>docker images</code>.',
    'Un conteneur <b>prod-web</b> tourne : il ne doit <b>pas</b> être touché.',
    'Supprimez les conteneurs arrêtés : <code>docker container prune</code> (répondez <code>y</code>).',
    'Supprimez les volumes que plus aucun conteneur n\'utilise : <code>docker volume prune</code> ne touche que les volumes <b>anonymes</b> (depuis Docker 23) ; pour les volumes nommés il faut <code>docker volume prune -a</code>. Le volume du conteneur qui tourne est épargné.',
    'Supprimez les images inutilisées : <code>docker image prune -a</code>. L\'image de « prod-web » est conservée.',
    'Relancez <code>docker system df</code> : l\'espace récupérable doit avoir fortement baissé.'],
  build(lab) {
    NS.execLines(lab, ['docker volume create vieux-donnees', 'docker run -d --name prod-web -p 8080:80 -v prod-data:/data nginx', 'docker run --name tmp1 alpine echo un', 'docker run --name tmp2 -v vieux-donnees:/d alpine echo deux', 'docker run --name tmp3 busybox echo trois', 'docker pull redis:7', 'docker pull httpd']);
  },
  solve: solveWith(['docker system df', 'docker container prune -f', 'docker volume prune -a -f', 'docker image prune -a -f', 'docker system df']),
  checks: [
    { label: 'Le conteneur « prod-web » tourne toujours', run: c => c.running('prod-web') },
    { label: 'Plus aucun conteneur arrêté', run: c => c.count('exited') === 0 },
    { label: 'Plus aucun volume inutilisé (prod-data, utilisé, est conservé)', run: c => c.unusedVolumes() === 0 && c.volume('prod-data') },
    { label: 'Plus aucune image inutilisée (nginx, utilisée, est conservée)', run: c => c.unusedImages() === 0 && c.image('nginx') },
  ],
});

/* ================================================= Conteneurs */
SC.push({
  id: 'ports-env', diff: 2, cat: 'Conteneurs', level: 'Intermédiaire', duration: '30 min', title: 'Publier des ports et configurer par variables',
  desc: 'Deux sites web et une base de données doivent cohabiter sur le même hôte. Le port 8080 est déjà occupé : à vous d\'organiser les ports et de configurer PostgreSQL par variables d\'environnement.',
  objectives: ['Publier un port avec -p hôte:conteneur', 'Éviter les conflits de ports', 'Configurer une image avec -e', 'Lire une erreur dans les journaux'],
  steps: [
    'Un site <b>site1</b> (nginx) occupe déjà le port 8080 de l\'hôte : <code>docker ps</code>.',
    'Lancez un second site <b>site2</b> avec l\'image <b>httpd</b> (Apache) accessible sur l\'hôte au port <b>8081</b> : <code>docker run -d --name site2 -p 8081:80 httpd</code>. Testez avec <code>curl localhost:8081</code>.',
    'Pourquoi le port du <i>conteneur</i> (80) peut-il être identique pour les deux sites ? Chaque conteneur a sa propre pile réseau ; seul le port de l\'<i>hôte</i> doit être unique.',
    'Lancez une base <b>db</b> avec l\'image <b>postgres</b> : essayez d\'abord sans variable (<code>docker run -d --name db postgres</code>) et lisez <code>docker logs db</code> : le conteneur refuse de démarrer sans mot de passe.',
    'Supprimez-le (<code>docker rm db</code>) et relancez-le correctement : <code>docker run -d --name db -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=appdb postgres</code>.',
    'Vérifiez <code>docker ps</code> : trois conteneurs doivent tourner. <code>docker port site2</code> affiche la publication.'],
  build(lab) { NS.execLines(lab, ['docker run -d --name site1 -p 8080:80 nginx']); },
  solve: solveWith(['docker run -d --name site2 -p 8081:80 httpd', 'curl localhost:8081', 'docker run -d --name db postgres', 'docker logs db', 'docker rm db', 'docker run -d --name db -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=appdb postgres', 'docker ps']),
  checks: [
    { label: 'site1 (nginx) tourne toujours sur le port 8080', run: c => c.running('site1') && c.published('site1', 8080, 80) },
    { label: 'site2 est un serveur httpd en cours d\'exécution', run: c => c.running('site2') && c.imageOf('site2') === 'httpd' },
    { label: 'http://localhost:8081 répond « It works! »', run: c => c.http('http://localhost:8081').body.includes('It works!') },
    { label: 'La base « db » (postgres) tourne', run: c => c.running('db') && c.imageOf('db') === 'postgres' },
    { label: 'db est configurée avec POSTGRES_PASSWORD et POSTGRES_DB=appdb', run: c => !!c.env('db', 'POSTGRES_PASSWORD') && c.env('db', 'POSTGRES_DB') === 'appdb' },
  ],
});

SC.push({
  id: 'depannage', diff: 2, cat: 'Conteneurs', level: 'Intermédiaire', duration: '25 min', title: 'Dépannage : le conteneur qui s\'arrête tout seul',
  desc: 'Une application de base de données ne démarre plus et un cache redémarre en boucle. Diagnostiquez avec logs, inspect et ps, puis réparez.',
  objectives: ['Lire l\'état et le code de sortie d\'un conteneur', 'Utiliser docker logs et docker inspect pour diagnostiquer', 'Comprendre les politiques de redémarrage'],
  steps: [
    'Faites <code>docker ps -a</code> : la base <b>base-clients</b> est <i>Exited (1)</i>. Un code de sortie différent de 0 signale une erreur.',
    'Cherchez la cause : <code>docker logs base-clients</code>.',
    'Corrigez : un conteneur existant ne change pas de variables. Supprimez-le puis recréez-le <b>avec</b> le mot de passe : <code>docker rm base-clients</code> puis <code>docker run -d --name base-clients -e POSTGRES_PASSWORD=motdepasse postgres</code>.',
    'Le conteneur <b>cache-fou</b> a une politique <code>--restart always</code> mais plante : observez <code>docker ps</code> (statut <i>Restarting</i>) et <code>docker inspect -f "{{.RestartCount}}" cache-fou</code>.',
    'Arrêtez cette boucle en supprimant le conteneur de force : <code>docker rm -f cache-fou</code>.',
    'Vérifiez qu\'il ne reste que <b>base-clients</b>, en cours d\'exécution.'],
  build(lab) { NS.execLines(lab, ['docker run -d --name base-clients postgres', 'docker run -d --name cache-fou --restart always alpine sh -c "echo plantage; exit 3"']); lab.clock.runFor(4000); },
  solve: solveWith(['docker logs base-clients', 'docker rm base-clients', 'docker run -d --name base-clients -e POSTGRES_PASSWORD=motdepasse postgres', 'docker rm -f cache-fou', 'docker ps -a']),
  checks: [
    { label: 'base-clients tourne', run: c => c.running('base-clients') },
    { label: 'base-clients a reçu un mot de passe (POSTGRES_PASSWORD)', run: c => !!c.env('base-clients', 'POSTGRES_PASSWORD') },
    { label: 'cache-fou a été supprimé (plus de boucle de redémarrage)', run: c => !c.exists('cache-fou') },
  ],
});

/* ================================================= Données */
SC.push({
  id: 'volume-nomme', diff: 2, cat: 'Données', level: 'Intermédiaire', duration: '30 min', title: 'Volumes : garder ses données quand le conteneur disparaît',
  desc: 'Un conteneur est jetable, pas ses données. Créez un site web dont le contenu survit à la suppression du conteneur grâce à un volume nommé.',
  objectives: ['Distinguer système de fichiers du conteneur et volume', 'Créer et monter un volume nommé', 'Prouver la persistance en recréant le conteneur'],
  steps: [
    'Créez le volume : <code>docker volume create site</code> puis <code>docker volume ls</code>.',
    'Lancez nginx avec ce volume monté sur le dossier du site : <code>docker run -d --name web -p 8080:80 -v site:/usr/share/nginx/html nginx</code>. (Au premier montage, le volume est rempli avec le contenu de l\'image.)',
    'Modifiez la page : <code>docker exec web sh -c "echo Bonjour de Formaxion > /usr/share/nginx/html/index.html"</code> puis <code>curl localhost:8080</code>.',
    '<b>Expérience :</b> supprimez le conteneur avec <code>docker rm -f web</code>. Le contenu est-il perdu ? Regardez <code>docker volume ls</code>.',
    'Recréez un conteneur <b>web2</b> avec le <b>même volume</b> : <code>docker run -d --name web2 -p 8080:80 -v site:/usr/share/nginx/html nginx</code>. <code>curl localhost:8080</code> affiche toujours « Bonjour de Formaxion ».',
    'Remarque : sans volume, tout ce qui est écrit dans un conteneur disparaît avec lui. Essayez, pour comparer, <code>docker run --rm alpine sh -c "echo x > /f; cat /f"</code> puis refaites un <code>run</code> : le fichier n\'existe plus.'],
  build(lab) { },
  solve: solveWith(['docker volume create site', 'docker run -d --name web -p 8080:80 -v site:/usr/share/nginx/html nginx', 'docker exec web sh -c "echo Bonjour de Formaxion > /usr/share/nginx/html/index.html"', 'curl localhost:8080', 'docker rm -f web', 'docker run -d --name web2 -p 8080:80 -v site:/usr/share/nginx/html nginx', 'curl localhost:8080']),
  checks: [
    { label: 'Le volume « site » existe', run: c => c.volume('site') },
    { label: 'Le conteneur d\'origine « web » a été supprimé', run: c => !c.exists('web') },
    { label: 'Un nouveau conteneur (web2) tourne avec le volume site monté sur /usr/share/nginx/html', run: c => c.running('web2') && c.mountsVolume('web2', 'site', '/usr/share/nginx/html') },
    { label: 'http://localhost:8080 affiche encore « Bonjour de Formaxion »', run: c => c.http('http://localhost:8080').body.includes('Bonjour de Formaxion') },
  ],
});

SC.push({
  id: 'bind-mount', diff: 2, cat: 'Données', level: 'Intermédiaire', duration: '30 min', title: 'Monter un dossier de l\'hôte (bind mount)',
  desc: 'Pendant le développement, on veut éditer ses fichiers sur l\'hôte et les voir immédiatement dans le conteneur. C\'est le rôle du bind mount.',
  objectives: ['Créer des fichiers sur l\'hôte', 'Monter un dossier dans un conteneur avec -v chemin:chemin', 'Comprendre qu\'un bind mount masque le contenu de l\'image', 'Monter en lecture seule (:ro)'],
  steps: [
    'Créez un dossier de travail : <code>mkdir -p ~/monsite && cd ~/monsite</code>.',
    'Écrivez une page : <code>echo "&lt;h1&gt;Mon site&lt;/h1&gt;" &gt; index.html</code> (ou ouvrez l\'onglet « Fichiers de l\'hôte », ou <code>nano index.html</code>).',
    'Lancez nginx en montant ce dossier en <b>lecture seule</b> : <code>docker run -d --name dev -p 8080:80 -v ~/monsite:/usr/share/nginx/html:ro nginx</code> (utilisez le chemin absolu <code>/home/student/monsite</code> si votre shell ne développe pas le ~).',
    'Testez : <code>curl localhost:8080</code> affiche « Mon site ». Le montage <b>masque</b> la page « Welcome to nginx » de l\'image.',
    'Modifiez <code>index.html</code> sur l\'hôte (nouvel <code>echo</code>) : la page change <b>sans redémarrer</b> le conteneur.',
    'Essayez d\'écrire depuis le conteneur : <code>docker exec dev sh -c "echo x &gt; /usr/share/nginx/html/test.txt"</code> → erreur « Read-only file system » grâce à <code>:ro</code>.'],
  build(lab) { },
  solve: solveWith(['mkdir -p /home/student/monsite', 'echo "<h1>Mon site</h1>" > /home/student/monsite/index.html', 'docker run -d --name dev -p 8080:80 -v /home/student/monsite:/usr/share/nginx/html:ro nginx', 'curl localhost:8080', 'docker exec dev sh -c "echo x > /usr/share/nginx/html/test.txt"']),
  checks: [
    { label: 'Un fichier index.html existe dans un dossier de votre répertoire personnel', run: c => /Mon site|<h1>/.test(c.hostFile('/home/student/monsite/index.html') || '') || c.lab.hostFs.list('/home/student').some(d => (c.hostFile('/home/student/' + d + '/index.html') || '').length > 0) },
    { label: 'Le conteneur « dev » tourne avec un bind mount sur /usr/share/nginx/html', run: c => c.running('dev') && c.mountsBind('dev', '/usr/share/nginx/html') },
    { label: 'Le montage est en lecture seule (:ro)', run: c => { const x = c.get('dev'); return !!x && x.mounts.some(m => m.type === 'bind' && m.destination === '/usr/share/nginx/html' && !m.rw); } },
    { label: 'http://localhost:8080 sert votre page (et non « Welcome to nginx »)', run: c => { const b = c.http('http://localhost:8080').body; return b.length > 0 && !b.includes('Welcome to nginx'); } },
  ],
});

/* ================================================= Réseau */
SC.push({
  id: 'reseau-dns', diff: 2, cat: 'Réseau', level: 'Intermédiaire', duration: '30 min', title: 'Réseaux Docker : faire dialoguer deux conteneurs par leur nom',
  desc: 'Une API et un client tournent sur le réseau par défaut et ne peuvent pas se joindre par leur nom. Créez un réseau dédié pour activer la résolution DNS interne.',
  objectives: ['Constater les limites du réseau bridge par défaut', 'Créer un réseau défini par l\'utilisateur', 'Utiliser la résolution de noms de Docker', 'Connecter un conteneur existant avec docker network connect'],
  steps: [
    'Observez : <code>docker ps</code> et <code>docker network ls</code>. Les conteneurs <b>api</b> (nginx) et <b>client</b> (alpine) sont sur le réseau <code>bridge</code> par défaut.',
    'Entrez dans le client : <code>docker exec -it client sh</code> puis essayez <code>wget -qO- http://api</code> : le nom <b>n\'est pas résolu</b> (pas de DNS sur le bridge par défaut). Tapez <code>exit</code>.',
    'Créez un réseau : <code>docker network create app-net</code> puis <code>docker network inspect app-net</code> (sous-réseau, passerelle).',
    'Branchez les deux conteneurs : <code>docker network connect app-net api</code> et <code>docker network connect app-net client</code>.',
    'Retestez depuis le client : <code>docker exec client wget -qO- http://api</code> → la page nginx s\'affiche : le nom « api » est résolu par le DNS embarqué de Docker (127.0.0.11).',
    'Regardez les adresses : <code>docker inspect -f \'{{range $k,$v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}\' api</code> — le conteneur a maintenant <b>deux</b> adresses.'],
  build(lab) { NS.execLines(lab, ['docker run -d --name api nginx', 'docker run -d --name client alpine sleep 3600']); },
  solve: solveWith(['docker exec client wget -qO- http://api', 'docker network create app-net', 'docker network connect app-net api', 'docker network connect app-net client', 'docker exec client wget -qO- http://api']),
  checks: [
    { label: 'Le réseau « app-net » existe', run: c => c.network('app-net') },
    { label: 'api est connecté à app-net', run: c => c.onNet('api', 'app-net') },
    { label: 'client est connecté à app-net', run: c => c.onNet('client', 'app-net') },
    { label: 'Depuis client, http://api répond (résolution par nom)', run: c => c.http('http://api', 'client').body.includes('Welcome to nginx') },
  ],
});

SC.push({
  id: 'isolation', diff: 3, cat: 'Réseau', level: 'Avancé', duration: '40 min', title: 'Isoler deux applications avec un conteneur passerelle',
  desc: 'Deux applications (« compta » et « rh ») ne doivent pas se voir. Seul un conteneur « passerelle » peut parler aux deux. Vérifiez l\'isolation… et ses limites.',
  objectives: ['Créer deux réseaux isolés', 'Rattacher un conteneur à plusieurs réseaux', 'Vérifier l\'isolation avec ping et wget', 'Comprendre le DNS par réseau'],
  steps: [
    'Créez deux réseaux : <code>docker network create reseau-compta</code> et <code>docker network create reseau-rh</code>.',
    'Lancez <b>compta</b> (nginx) sur le premier et <b>rh</b> (nginx) sur le second : <code>docker run -d --name compta --network reseau-compta nginx</code> (idem pour rh).',
    'Lancez un conteneur de test sur reseau-compta : <code>docker run -d --name passerelle --network reseau-compta alpine sleep 3600</code>.',
    'Depuis <b>passerelle</b>, joignez <b>compta</b> : <code>docker exec passerelle wget -qO- http://compta</code> ✔. Puis tentez <b>rh</b> : <code>docker exec passerelle wget -qO- -T 2 http://rh</code> ✘ (nom inconnu : réseaux séparés).',
    'Donnez à <b>passerelle</b> un second pied sur l\'autre réseau : <code>docker network connect reseau-rh passerelle</code>. Retentez : cette fois <b>rh</b> répond. Vous pouvez aussi tester <code>docker exec passerelle ping -c 1 rh</code>.',
    'Vérifiez que <b>compta</b> et <b>rh</b>, eux, restent isolés l\'un de l\'autre : <code>docker network inspect reseau-rh</code> ne liste que <b>rh</b> et <b>passerelle</b>. Seul un conteneur placé sur les deux réseaux fait le pont.'],
  build(lab) { },
  solve: solveWith(['docker network create reseau-compta', 'docker network create reseau-rh', 'docker run -d --name compta --network reseau-compta nginx', 'docker run -d --name rh --network reseau-rh nginx', 'docker run -d --name passerelle --network reseau-compta alpine sleep 3600', 'docker network connect reseau-rh passerelle', 'docker exec passerelle wget -qO- http://compta', 'docker exec passerelle wget -qO- http://rh']),
  checks: [
    { label: 'Les deux réseaux existent', run: c => c.network('reseau-compta') && c.network('reseau-rh') },
    { label: 'compta est uniquement sur reseau-compta, rh uniquement sur reseau-rh', run: c => c.onNet('compta', 'reseau-compta') && !c.get('compta').nets['reseau-rh'] && c.onNet('rh', 'reseau-rh') && !c.get('rh').nets['reseau-compta'] },
    { label: 'passerelle est connectée aux deux réseaux', run: c => c.onNet('passerelle', 'reseau-compta') && c.onNet('passerelle', 'reseau-rh') },
    { label: 'passerelle atteint compta et rh par leur nom', run: c => c.http('http://compta', 'passerelle').ok && c.http('http://rh', 'passerelle').ok },
    { label: 'compta et rh ne peuvent pas se joindre', run: c => !c.reach('compta', 'rh') && !c.reach('rh', 'compta') },
  ],
});

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
    ['Dockerfile et docker build', 'no', '—', 'Prévu (phase suivante)'],
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
  'Pas de docker build, de Dockerfile ni de Docker Compose pour l\'instant. Pas de docker login/push.',
  'Le réseau est simplifié : adressage, isolation et DNS sont fidèles, mais pas la latence ni les pertes de paquets.',
  'Le mini-shell couvre l\'essentiel (pipes, redirections, $(…), jokers, variables) mais pas les scripts avancés (boucles, fonctions).',
  'L\'hôte simulé n\'autorise l\'écriture que dans /home/student et /tmp, et le temps est simulé (démarrages, arrêts et redémarrages suivent une horloge réglable).',
];
})(typeof window !== 'undefined' ? window : globalThis);
