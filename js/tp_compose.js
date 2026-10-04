/* tp_compose.js — TP Docker Compose : décrire une application multi-conteneurs dans un fichier. */
(function (g) {
'use strict';
const NS = g.NS; const SC = NS.SCENARIOS; const P = NS.tpP, S = NS.tpS, solveWith = NS.solveWith;
const W = (lab, p, d) => { lab.hostFs.writep(p, d); };
/* commande qui écrit un fichier (utilisée par les corrections) */
const pf = (path, text) => "printf '" + text.replace(/\\/g, '\\\\').replace(/\n/g, '\\n') + "' > " + path;
const pre = t => '<pre>' + t.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>';

const BOUTIQUE = 'services:\n  web:\n    image: nginx\n    ports:\n      - "8080:80"\n  cache:\n    image: redis\n';

/* ================================================= 1. Découverte */
SC.push({
  id: 'compose-decouverte', diff: 2, cat: 'Compose', level: 'Intermédiaire', duration: '40 min', title: 'Docker Compose : lancer une application en une commande',
  desc: 'Une boutique est composée d\'un serveur web et d\'un cache Redis. Au lieu de deux « docker run », un seul fichier Compose décrit l\'ensemble.',
  objectives: ['Expliquer à quoi sert Docker Compose', 'Lire un fichier compose.yaml (services, image, ports)', 'Utiliser up, ps, logs, stop, start', 'Identifier ce que Compose crée automatiquement (réseau, noms)'],
  parts: [
    P('Pourquoi Compose ?', [
      'Une application réelle compte plusieurs conteneurs : un serveur web, une base de données, un cache… Les lancer avec <code>docker run</code> exige de retenir pour chacun une longue liste d\'options (réseau, ports, volumes, variables) et de les exécuter <b>dans le bon ordre</b>. C\'est long, source d\'erreurs, et impossible à partager proprement.',
      '<b>Docker Compose</b> résout ce problème : on décrit toute l\'application dans <b>un fichier texte</b> (<code>compose.yaml</code>) et on la pilote avec <code>docker compose …</code>. Ce fichier se versionne avec le code : n\'importe qui obtient le même environnement avec une seule commande.',
      'Le fichier est au format <b>YAML</b> : des couples <code>clé: valeur</code>, une <b>indentation par espaces</b> (jamais de tabulation) qui exprime l\'imbrication, et des listes introduites par un tiret. Sous la clé <code>services:</code> on déclare un bloc par conteneur ; <b>le nom du service</b> sert aussi de nom DNS pour que les services se joignent entre eux.'],
    [S('Allez dans le projet et regardez-le : <code>cd ~/boutique &amp;&amp; ls</code>.', 'Compose cherche automatiquement un fichier <b>compose.yaml</b> dans le dossier courant. Le <b>nom du dossier</b> devient le nom du <i>projet</i>.', 'Un seul fichier : <code>compose.yaml</code>.'),
     S('Lisez le fichier : <code>cat compose.yaml</code>.', 'Avant de lancer quoi que ce soit, on lit : c\'est le « plan » de l\'application.', 'Deux services : <b>web</b> (image nginx, port 8080 de l\'hôte vers 80 du conteneur) et <b>cache</b> (image redis). Notez les espaces d\'indentation.', [['services:', 'liste des conteneurs de l\'application'], ['web:', 'nom du service (aussi son nom DNS)'], ['image: nginx', 'image utilisée (comme l\'argument de docker run)'], ['ports: - "8080:80"', 'équivalent de -p 8080:80']]),
     S('Faites afficher la version « comprise » par Docker : <code>docker compose config</code>.', 'La commande valide le fichier et le réécrit avec toutes les valeurs explicites. C\'est le meilleur réflexe pour détecter une erreur <i>avant</i> de lancer.', 'Le même fichier en version complète : le nom du projet (<code>name: boutique</code>), un réseau <code>boutique_default</code> apparu tout seul, les ports en notation détaillée.')]),
    P('Démarrer le projet', [
      '<code>docker compose up</code> crée tout ce qui manque : le <b>réseau</b> du projet, puis un conteneur par service. Les noms suivent le modèle <code>projet-service-numéro</code> (ici <code>boutique-web-1</code>). Avec <code>-d</code> (detached), le terminal est rendu ; sans lui, il affiche les journaux de tous les services jusqu\'à Ctrl+C.',
      'Ce sont de <b>vrais conteneurs Docker ordinaires</b> : Compose ne fait que lancer pour vous les commandes que vous écririez à la main, et pose des <i>étiquettes</i> (labels) pour retrouver ses conteneurs.'],
    [S('Lancez : <code>docker compose up -d</code>.', 'Compose télécharge les images absentes, crée le réseau puis démarre les deux conteneurs.', 'Un bloc « [+] Running » : les images téléchargées (Pulled), le réseau <code>boutique_default</code> (Created), puis <code>boutique-web-1</code> et <code>boutique-cache-1</code> (Started).', [['up', 'crée et démarre les services'], ['-d', 'en arrière-plan']]),
     S('Listez les services du projet : <code>docker compose ps</code>.', 'Comme docker ps, mais limité à ce projet et avec une colonne SERVICE.', 'Deux lignes « Up », le port <code>0.0.0.0:8080-&gt;80/tcp</code> pour web.'),
     S('Testez le site : <code>curl localhost:8080</code>.', 'Le port 8080 de l\'hôte est publié grâce à la ligne <code>ports</code> du fichier.', 'La page « Welcome to nginx! ».'),
     S('Lisez les journaux du cache : <code>docker compose logs cache</code>.', 'Compose agrège les journaux ; chaque ligne est préfixée du nom du conteneur. Sans nom de service, il affiche tous les services.', 'Les lignes de démarrage de Redis, préfixées par <code>boutique-cache-1  |</code>.'),
     S('Regardez le réseau : <code>docker network ls</code>.', 'Compose a créé un réseau dédié au projet : les conteneurs s\'y joignent par le <b>nom de leur service</b>.', 'Un réseau <code>boutique_default</code> en plus de bridge, host et none.')]),
    P('Arrêter, redémarrer', [
      '<code>stop</code> arrête les conteneurs sans les supprimer, <code>start</code> les redémarre. <code>down</code> (à retenir !) arrête <b>et supprime</b> les conteneurs et le réseau — mais conserve les volumes. <code>up</code> est <b>idempotent</b> : relancé alors que rien n\'a changé, il ne recrée rien.'],
    [S('Arrêtez : <code>docker compose stop</code>, puis <code>docker compose ps -a</code>.', '<code>ps</code> seul n\'affiche que les conteneurs en cours ; <code>-a</code> montre aussi ceux qui sont arrêtés.', 'Les deux conteneurs sont « Exited ».'),
     S('Redémarrez : <code>docker compose start</code>, puis <code>docker compose up -d</code>.', 'start relance les conteneurs existants. up -d ensuite constate que tout tourne déjà et ne change rien.', 'Pour up -d : « Running » (et non « Started ») devant chaque conteneur : rien n\'a été recréé.')]),
  ],
  recap: ['Un fichier compose.yaml décrit l\'application ; docker compose up -d la démarre.', 'Le nom du dossier devient le nom du projet : conteneurs « projet-service-1 », réseau « projet_default ».', 'Le nom d\'un service est son nom DNS dans le réseau du projet.', 'down supprime conteneurs et réseau (pas les volumes) ; stop/start conservent les conteneurs.', 'docker compose config valide et affiche le fichier tel que Docker le comprend.'],
  build(lab) { W(lab, '/home/student/boutique/compose.yaml', BOUTIQUE); },
  solve: solveWith(['cd /home/student/boutique', 'cat compose.yaml', 'docker compose config', 'docker compose up -d', 'docker compose ps', 'curl localhost:8080', 'docker compose logs cache', 'docker network ls', 'docker compose stop', 'docker compose ps -a', 'docker compose start', 'docker compose up -d']),
  checks: [
    { label: 'Le service web (boutique-web-1) tourne, port 8080 publié', run: c => c.running('boutique-web-1') && c.published('boutique-web-1', 8080, 80) },
    { label: 'Le service cache (boutique-cache-1) tourne', run: c => c.running('boutique-cache-1') },
    { label: 'Le réseau boutique_default a été créé par Compose', run: c => c.network('boutique_default') && c.onNet('boutique-web-1', 'boutique_default') && c.onNet('boutique-cache-1', 'boutique_default') },
    { label: 'http://localhost:8080 répond', run: c => c.http('http://localhost:8080').body.includes('nginx') },
  ],
});

/* ================================================= 2. Écrire son fichier */
const VITRINE = 'services:\n  site:\n    image: nginx:alpine\n    ports:\n      - "8081:80"\n    volumes:\n      - ./html:/usr/share/nginx/html:ro\n  cache:\n    image: redis\n    restart: unless-stopped\n    volumes:\n      - cache-data:/data\nvolumes:\n  cache-data:\n';
SC.push({
  id: 'compose-ecrire', diff: 2, cat: 'Compose', level: 'Intermédiaire', duration: '45 min', title: 'Écrire son propre fichier Compose',
  desc: 'À partir d\'un cahier des charges, écrivez le fichier compose.yaml d\'un site statique et de son cache, avec bind mount, volume nommé et politique de redémarrage.',
  objectives: ['Écrire un fichier Compose valide (YAML)', 'Traduire des options de docker run : ports, volumes, restart', 'Déclarer un volume nommé au niveau racine', 'Valider avec docker compose config'],
  parts: [
    P('Du docker run au fichier Compose', [
      'Chaque option de <code>docker run</code> a son équivalent dans un service : <code>-p 8081:80</code> devient la liste <code>ports</code>, <code>-v dossier:/chemin:ro</code> devient la liste <code>volumes</code>, <code>--restart unless-stopped</code> devient <code>restart</code>, <code>-e VAR=x</code> devient <code>environment</code>.',
      'Deux règles à connaître. 1) Un <b>volume nommé</b> doit être <b>déclaré</b> dans la section racine <code>volumes:</code> (sinon Compose refuse le fichier). 2) Un chemin <b>relatif</b> comme <code>./html</code> est calculé par rapport au dossier du fichier Compose : on peut donc déplacer tout le projet sans rien changer.',
      'Cahier des charges : un service <b>site</b> (nginx:alpine) publié sur le port <b>8081</b>, qui sert le dossier <code>./html</code> monté en <b>lecture seule</b> ; un service <b>cache</b> (redis) qui redémarre automatiquement sauf arrêt volontaire, avec ses données dans un volume nommé <b>cache-data</b>.'],
    [S('Allez dans le dossier : <code>cd ~/vitrine &amp;&amp; ls</code>.', 'Le site (dossier html) existe déjà, mais il n\'y a pas encore de fichier Compose.', 'Un dossier <code>html</code>.'),
     S('Créez le fichier avec l\'éditeur : <code>nano compose.yaml</code>, puis recopiez le contenu ci-dessous (Ctrl+O, Entrée, Ctrl+X). Attention : <b>2 espaces</b> par niveau, <b>aucune tabulation</b>.' + pre(VITRINE), 'L\'indentation est la syntaxe même du YAML : une ligne mal décalée change le sens, ou rend le fichier invalide. Si vous bloquez, « Charger la correction » écrit le fichier à votre place.', '<code>cat compose.yaml</code> affiche le fichier.', [['./html:/usr/share/nginx/html:ro', 'dossier du projet : dossier de nginx, en lecture seule'], ['cache-data:/data', 'volume nommé : dossier où Redis stocke ses données'], ['restart: unless-stopped', 'redémarre sauf si vous avez arrêté le conteneur vous-même'], ['volumes: cache-data:', 'déclaration du volume nommé (au niveau racine)']])]),
    P('Valider puis démarrer', [
      '<code>docker compose config -q</code> (<i>quiet</i>) ne fait que vérifier : il n\'affiche rien si le fichier est valide, et une erreur précise sinon. Prenez l\'habitude de le lancer avant chaque <code>up</code>.'],
    [S('Validez : <code>docker compose config -q</code>.', 'Pour détecter une faute de frappe avant de démarrer.', 'Aucune sortie : le fichier est valide. (En cas d\'erreur, lisez le message : il cite la ligne ou le service en cause.)'),
     S('Démarrez : <code>docker compose up -d</code>, puis <code>curl localhost:8081</code>.', 'Compose crée le réseau, le volume <code>vitrine_cache-data</code> (préfixé par le projet), puis les deux conteneurs.', 'Le contenu de votre page (« Vitrine »).'),
     S('Modifiez la page sur l\'hôte : <code>echo "&lt;h1&gt;Vitrine v2&lt;/h1&gt;" &gt; html/index.html</code>, puis <code>curl localhost:8081</code>.', 'Le bind mount relie le dossier de l\'hôte au conteneur : la modification est visible tout de suite, sans redémarrer.', '« Vitrine v2 ».'),
     S('Observez le volume : <code>docker volume ls</code>.', 'Compose préfixe le nom du volume par celui du projet pour éviter les collisions entre projets.', 'Un volume nommé <code>vitrine_cache-data</code>.')]),
  ],
  recap: ['Chaque option de docker run a son équivalent dans le service (ports, volumes, restart, environment…).', 'Un volume nommé s\'utilise dans le service ET se déclare dans la section racine volumes.', 'Les chemins relatifs sont relatifs au fichier Compose.', 'docker compose config -q valide un fichier sans rien lancer.'],
  build(lab) { W(lab, '/home/student/vitrine/html/index.html', '<h1>Vitrine</h1>\n'); },
  solve: solveWith(['cd /home/student/vitrine', pf('compose.yaml', VITRINE), 'docker compose config -q', 'docker compose up -d', 'curl localhost:8081', 'echo "<h1>Vitrine v2</h1>" > html/index.html', 'curl localhost:8081', 'docker volume ls']),
  checks: [
    { label: 'compose.yaml existe et déclare les services site et cache', run: c => { const y = c.yaml('/home/student/vitrine/compose.yaml'); return !!y && !!y.services && !!y.services.site && !!y.services.cache; } },
    { label: 'Le volume cache-data est déclaré à la racine du fichier', run: c => { const y = c.yaml('/home/student/vitrine/compose.yaml'); return !!y && !!y.volumes && 'cache-data' in y.volumes; } },
    { label: 'site tourne, port 8081 publié, dossier html monté en lecture seule', run: c => { const x = c.get('vitrine-site-1'); return !!x && c.published('vitrine-site-1', 8081, 80) && x.mounts.some(m => m.type === 'bind' && m.destination === '/usr/share/nginx/html' && !m.rw); } },
    { label: 'cache tourne avec le volume vitrine_cache-data et le redémarrage unless-stopped', run: c => c.running('vitrine-cache-1') && c.mountsVolume('vitrine-cache-1', 'vitrine_cache-data') && c.restart('vitrine-cache-1') === 'unless-stopped' },
    { label: 'http://localhost:8081 sert votre page', run: c => /Vitrine/.test(c.http('http://localhost:8081').body) },
  ],
});

/* ================================================= 3. Lire les erreurs */
const CASSE = 'services:\n  web:\n    imagee: nginx\n    ports:\n      - "8080:80"\n  db:\n    image: redis\n    volumes:\n      - donnees:/data\n';
SC.push({
  id: 'compose-erreurs', diff: 3, cat: 'Compose', level: 'Avancé', duration: '45 min', title: 'Dépanner un fichier Compose',
  desc: 'Le fichier d\'un collègue ne démarre pas. Trois erreurs de nature différente se cachent dedans : à vous de les lire, de les comprendre et de les corriger une à une.',
  objectives: ['Lire un message d\'erreur de Compose', 'Distinguer erreur de syntaxe, erreur de logique et erreur d\'exécution', 'Corriger un fichier et valider', 'Résoudre un conflit de port'],
  parts: [
    P('Trois familles d\'erreurs', [
      'Quand <code>docker compose up</code> échoue, la première question est : <b>à quelle étape ?</b> 1) <b>Lecture du fichier</b> (syntaxe YAML, propriété inconnue) : rien n\'est créé. 2) <b>Validation</b> (le fichier est lisible mais incohérent : volume non déclaré, service inconnu dans depends_on) : rien n\'est créé non plus. 3) <b>Exécution</b> (port déjà pris, image introuvable) : une partie du projet est déjà créée, il faut regarder l\'état avec <code>docker compose ps</code>.',
      'Dans tous les cas : <b>lisez le message en entier</b>. Compose y indique le service, la propriété ou le port en cause.'],
    [S('Allez dans le projet : <code>cd ~/boutique-cassee</code>, regardez le fichier (<code>cat compose.yaml</code>), puis tentez : <code>docker compose up -d</code>.', 'On provoque l\'erreur pour la lire.', 'Une erreur <code>validating … services.web Additional property imagee is not allowed</code> : la propriété « imagee » n\'existe pas (faute de frappe).'),
     S('Corrigez la faute avec <code>nano compose.yaml</code> (<code>imagee</code> → <code>image</code>), puis relancez <code>docker compose up -d</code>.', 'Après chaque correction, on relance pour voir l\'erreur suivante.', 'Une nouvelle erreur : <code>service "db" refers to undefined volume donnees</code> — erreur de <i>logique</i> : le volume est utilisé mais jamais déclaré.')]),
    P('Corriger la logique', [
      'Un volume nommé utilisé dans un service doit être déclaré dans la section racine <code>volumes:</code>. Ajoutez à la fin du fichier deux lignes : <code>volumes:</code> puis, indentée de deux espaces, <code>donnees:</code>.'],
    [S('Ajoutez la déclaration en fin de fichier (<code>nano compose.yaml</code>), validez avec <code>docker compose config -q</code>, puis <code>docker compose up -d</code>.', 'config -q vérifie le fichier sans lancer. Ici le fichier devient valide… mais l\'exécution va échouer.', 'Compose crée le réseau, le volume et démarre db, puis une erreur : <code>Bind for 0.0.0.0:8080 failed: port is already allocated</code>.')]),
    P('Erreur d\'exécution : le port est pris', [
      'Un port de l\'hôte ne peut être utilisé que par <b>un seul</b> processus. Un autre conteneur (« ancien ») publie déjà le 8080. Deux solutions : changer le port du côté <b>hôte</b> dans le fichier (<code>"8090:80"</code> : hôte à gauche, conteneur à droite), ou arrêter le conteneur gênant. Après l\'échec, une partie du projet existe déjà : <code>docker compose ps -a</code> permet de s\'en rendre compte.'],
    [S('Identifiez le coupable : <code>docker ps</code> puis <code>docker compose ps -a</code>.', 'Pour savoir qui occupe le port et où en est le projet.', 'Le conteneur <b>ancien</b> publie 0.0.0.0:8080 ; le projet a son service db démarré et web « Created » (non démarré).'),
     S('Changez le port dans le fichier (<code>"8090:80"</code>) puis relancez : <code>docker compose up -d</code>.', 'On modifie le côté hôte du mappage ; le service web, déjà créé, est recréé avec la nouvelle configuration.', 'Cette fois les deux services démarrent. <code>curl localhost:8090</code> répond.')]),
  ],
  recap: ['Erreur de lecture ou de validation : rien n\'est créé, corrigez le fichier.', 'Erreur d\'exécution (port, image) : une partie du projet peut exister — docker compose ps -a.', 'Un volume nommé doit être déclaré à la racine.', 'Port hôte à gauche, port conteneur à droite ; un port hôte = un seul usage.', 'docker compose config -q avant chaque up.'],
  build(lab) { W(lab, '/home/student/boutique-cassee/compose.yaml', CASSE); NS.execLines(lab, ['docker run -d --name ancien -p 8080:80 nginx']); },
  solve: solveWith(['cd /home/student/boutique-cassee', pf('compose.yaml', 'services:\n  web:\n    image: nginx\n    ports:\n      - "8090:80"\n  db:\n    image: redis\n    volumes:\n      - donnees:/data\nvolumes:\n  donnees:\n'), 'docker compose config -q', 'docker compose up -d', 'curl localhost:8090']),
  checks: [
    { label: 'Le fichier est valide : la propriété « image » est correcte', run: c => { const y = c.yaml('/home/student/boutique-cassee/compose.yaml'); return !!y && !!y.services && !!y.services.web && y.services.web.image === 'nginx' && !('imagee' in y.services.web); } },
    { label: 'Le volume donnees est déclaré à la racine', run: c => { const y = c.yaml('/home/student/boutique-cassee/compose.yaml'); return !!y && !!y.volumes && 'donnees' in y.volumes; } },
    { label: 'Le service web tourne sur un port hôte libre (pas 8080)', run: c => { const x = c.get('boutique-cassee-web-1'); return !!x && x.running && (x._bound || []).some(b => b.port === 80 && b.hostPort !== 8080); } },
    { label: 'Le service db tourne avec le volume boutique-cassee_donnees', run: c => c.running('boutique-cassee-db-1') && c.mountsVolume('boutique-cassee-db-1', 'boutique-cassee_donnees') },
    { label: 'Le conteneur « ancien » n\'a pas été touché', run: c => c.running('ancien') },
  ],
});

/* ================================================= 4. Données, santé, ordre */
const DONNEES = 'services:\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: secret\n    volumes:\n      - pgdata:/var/lib/postgresql/data\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U postgres"]\n      interval: 5s\n      retries: 5\n  web:\n    image: nginx\n    ports:\n      - "8083:80"\n    depends_on:\n      db:\n        condition: service_healthy\n  notes:\n    image: alpine\n    command: sleep 3600\n    volumes:\n      - notes:/data\nvolumes:\n  pgdata:\n  notes:\n';
SC.push({
  id: 'compose-donnees', diff: 3, cat: 'Compose', level: 'Avancé', duration: '50 min', title: 'Ordre de démarrage, santé et persistance des données',
  desc: 'Le site ne doit démarrer qu\'une fois la base prête, et les données doivent survivre à un « docker compose down ».',
  objectives: ['Utiliser depends_on avec condition: service_healthy', 'Lire l\'état de santé d\'un conteneur', 'Montrer que down conserve les volumes', 'Savoir quand utiliser down -v'],
  parts: [
    P('Démarrer dans le bon ordre', [
      '<code>depends_on</code> indique à Compose quel service démarrer avant un autre. Mais « démarré » ne veut pas dire « prêt » : une base de données met plusieurs secondes à accepter des connexions après le lancement de son processus. Avec <code>condition: service_healthy</code>, Compose attend que le service dépendant soit déclaré <b>sain</b>.',
      'La santé est mesurée par un <b>healthcheck</b> : une commande exécutée régulièrement <i>dans</i> le conteneur (<code>interval</code>). Si elle réussit (code 0), le conteneur est « healthy » ; après <code>retries</code> échecs de suite, il devient « unhealthy ». En attendant : « health: starting ».'],
    [S('Allez dans le projet et lisez-le : <code>cd ~/donnees &amp;&amp; cat compose.yaml</code>.', 'On repère le healthcheck de db (<code>pg_isready</code>, l\'outil PostgreSQL qui teste la disponibilité) et le depends_on de web.', 'Trois services : db, web (qui dépend de db « healthy »), notes (un petit conteneur alpine pour manipuler des fichiers).', [['test: ["CMD-SHELL", …]', 'la commande de test, exécutée dans un shell du conteneur'], ['interval: 5s', 'fréquence du test'], ['retries: 5', 'échecs consécutifs tolérés avant « unhealthy »'], ['condition: service_healthy', 'web attend que db soit sain']]),
     S('Démarrez : <code>docker compose up -d</code>.', 'Compose démarre db, <b>attend</b> son état sain, puis seulement web.', 'Dans le bloc final, <code>donnees-db-1</code> est « Healthy » et <code>donnees-web-1</code> « Started » : l\'attente est visible dans les durées.'),
     S('Regardez l\'état : <code>docker compose ps</code>.', 'La colonne STATUS indique la santé.', '<code>Up … (healthy)</code> pour db.')]),
    P('Les données survivent à down', [
      'Un conteneur est <b>jetable</b> : <code>down</code> le supprime avec son système de fichiers. Les données importantes doivent donc vivre dans un <b>volume nommé</b>, qui lui existe indépendamment. <code>down</code> <b>conserve</b> les volumes ; seul <code>down -v</code> les supprime (à n\'utiliser qu\'en connaissance de cause : les données sont perdues).'],
    [S('Écrivez un fichier dans le volume : <code>docker compose exec notes sh -c "echo mes donnees &gt; /data/memo.txt"</code>.', 'On dépose une donnée dans le dossier /data du service notes, qui est un volume nommé.', 'Aucune sortie. <code>docker compose exec notes cat /data/memo.txt</code> affiche « mes donnees ».', [['exec notes', 'exécute une commande dans le service notes (pas besoin de connaître le nom du conteneur)'], ['sh -c "…"', 'lance un shell pour que la redirection > soit comprise DANS le conteneur']]),
     S('Supprimez tout le projet : <code>docker compose down</code>, puis <code>docker ps -a</code> et <code>docker volume ls</code>.', 'On détruit les conteneurs pour vérifier que les données, elles, subsistent.', 'Plus aucun conteneur, plus de réseau ; mais les volumes <code>donnees_pgdata</code> et <code>donnees_notes</code> sont toujours là.'),
     S('Recréez : <code>docker compose up -d</code>, puis <code>docker compose exec notes cat /data/memo.txt</code>.', 'De nouveaux conteneurs se rattachent aux mêmes volumes : les données sont retrouvées.', 'Le fichier est toujours là : « mes donnees ».')]),
  ],
  recap: ['depends_on ordonne ; avec condition: service_healthy il attend que le service soit réellement prêt.', 'healthcheck = commande de test exécutée régulièrement dans le conteneur ; STATUS montre (healthy).', 'down supprime conteneurs et réseau, pas les volumes ; down -v supprime aussi les volumes.', 'Les données à conserver vont dans un volume nommé.'],
  build(lab) { W(lab, '/home/student/donnees/compose.yaml', DONNEES); },
  solve: solveWith(['cd /home/student/donnees', 'docker compose up -d', 'docker compose ps', 'docker compose exec notes sh -c "echo mes donnees > /data/memo.txt"', 'docker compose down', 'docker volume ls', 'docker compose up -d', 'docker compose exec notes cat /data/memo.txt']),
  checks: [
    { label: 'La base donnees-db-1 tourne et est « healthy »', run: c => c.running('donnees-db-1') && c.health('donnees-db-1') === 'healthy' },
    { label: 'Le site donnees-web-1 tourne (port 8083)', run: c => c.running('donnees-web-1') && c.published('donnees-web-1', 8083, 80) },
    { label: 'Le fichier memo.txt a été écrit dans le volume donnees_notes', run: c => /mes donnees/.test(c.volFile('donnees_notes', '/memo.txt') || '') },
    { label: 'Le fichier est visible dans le NOUVEAU conteneur notes (recréé après down)', run: c => { const x = c.get('donnees-notes-1'); return !!x && x.running && /mes donnees/.test(c.inContainer('donnees-notes-1', '/data/memo.txt') || '') && c.lab.events.some(e => e.type === 'container' && e.action === 'destroy' && (e.attrs.name || '') === 'donnees-notes-1'); } },
  ],
});

/* ================================================= 5. Réseaux */
const TROIS = 'services:\n  front:\n    image: alpine\n    command: sleep 3600\n  api:\n    image: nginx\n  back:\n    image: alpine\n    command: sleep 3600\n';
const TROIS_OK = 'services:\n  front:\n    image: alpine\n    command: sleep 3600\n    networks:\n      - front\n  api:\n    image: nginx\n    networks:\n      - front\n      - back\n  back:\n    image: alpine\n    command: sleep 3600\n    networks:\n      - back\nnetworks:\n  front:\n  back:\n';
SC.push({
  id: 'compose-reseau', diff: 3, cat: 'Compose', level: 'Avancé', duration: '45 min', title: 'Cloisonner une application en deux réseaux',
  desc: 'Trois services (front, api, back) partagent le réseau par défaut : front peut joindre back directement. Modifiez le fichier pour que seule l\'api serve d\'intermédiaire.',
  objectives: ['Constater le réseau par défaut partagé de Compose', 'Déclarer des réseaux et y rattacher des services', 'Vérifier l\'isolation avec ping', 'Comprendre le DNS par réseau'],
  parts: [
    P('Le réseau par défaut', [
      'Par défaut, Compose crée <b>un seul réseau</b> (<code>projet_default</code>) où tous les services se voient et se joignent par leur nom. Pratique pour démarrer, mais peu sûr : si le front est compromis, il atteint directement la base.',
      'On déclare ses propres réseaux dans la section racine <code>networks:</code>, puis on rattache chaque service aux réseaux voulus avec une liste <code>networks:</code>. <b>Deux services qui n\'ont aucun réseau en commun ne peuvent ni se joindre ni même se résoudre par leur nom.</b> Le service « api », placé sur les deux réseaux, sert de passerelle.'],
    [S('Allez dans le projet et démarrez-le : <code>cd ~/trois-tiers &amp;&amp; docker compose up -d</code>.', 'Premier état : aucun réseau déclaré, donc tout est sur trois-tiers_default.', 'Trois conteneurs démarrés et un seul réseau créé : <code>trois-tiers_default</code>.'),
     S('Testez : <code>docker compose exec front ping -c 1 back</code>.', 'On constate le problème : front joint back directement.', 'Le ping réussit (« 1 packets transmitted, 1 received »).', [['exec front', 'lance la commande dans le service front'], ['ping -c 1 back', 'envoie un seul paquet vers le nom « back » (résolu par le DNS de Docker)']])]),
    P('Cloisonner', [
      'Objectif : réseau <b>front</b> pour front + api, réseau <b>back</b> pour api + back. Éditez <code>compose.yaml</code> : sous chaque service ajoutez la liste <code>networks</code> voulue, et déclarez <code>front:</code> et <code>back:</code> sous un <code>networks:</code> racine. Voici le fichier cible :' + pre(TROIS_OK)],
    [S('Modifiez le fichier (<code>nano compose.yaml</code>) pour obtenir le fichier cible ci-dessus, puis validez : <code>docker compose config -q</code>.', 'Un service qui cite un réseau non déclaré provoque une erreur de validation : config -q la détecte avant le démarrage.', 'Aucune sortie si le fichier est valide.'),
     S('Appliquez : <code>docker compose up -d</code>.', 'Compose détecte que la configuration des trois services a changé : il les <b>recrée</b> sur les nouveaux réseaux.', 'Deux nouveaux réseaux (<code>trois-tiers_front</code> et <code>trois-tiers_back</code>) et les trois conteneurs redémarrés.'),
     S('Testez l\'isolation : <code>docker compose exec front ping -c 1 back</code>, puis <code>docker compose exec front ping -c 1 api</code> et <code>docker compose exec back ping -c 1 api</code>.', 'Pour vérifier que front n\'atteint plus back, mais que l\'api reste joignable des deux côtés.', 'Premier ping : « bad address \'back\' » (le nom n\'est même plus résolu). Les deux autres réussissent.')]),
  ],
  recap: ['Sans configuration, tous les services partagent le réseau projet_default.', 'Réseaux déclarés à la racine, rattachés service par service avec networks.', 'Pas de réseau commun = pas de résolution de nom ni de communication.', 'Un service sur deux réseaux joue le rôle de passerelle.'],
  build(lab) { W(lab, '/home/student/trois-tiers/compose.yaml', TROIS); },
  solve: solveWith(['cd /home/student/trois-tiers', 'docker compose up -d', 'docker compose exec front ping -c 1 back', pf('compose.yaml', TROIS_OK), 'docker compose config -q', 'docker compose up -d', 'docker compose exec front ping -c 1 back', 'docker compose exec front ping -c 1 api', 'docker compose exec back ping -c 1 api']),
  checks: [
    { label: 'Les réseaux trois-tiers_front et trois-tiers_back existent', run: c => c.network('trois-tiers_front') && c.network('trois-tiers_back') },
    { label: 'front est sur le réseau front et api sur les deux', run: c => c.onNet('trois-tiers-front-1', 'trois-tiers_front') && c.onNet('trois-tiers-api-1', 'trois-tiers_front') && c.onNet('trois-tiers-api-1', 'trois-tiers_back') },
    { label: 'back n\'est que sur le réseau back', run: c => c.onNet('trois-tiers-back-1', 'trois-tiers_back') && !c.onNet('trois-tiers-back-1', 'trois-tiers_front') && !c.onNet('trois-tiers-back-1', 'trois-tiers_default') },
    { label: 'front ne peut plus joindre back', run: c => c.running('trois-tiers-front-1') && c.running('trois-tiers-back-1') && !c.reach('trois-tiers-front-1', 'trois-tiers-back-1') },
    { label: 'front et back joignent l\'api', run: c => c.reach('trois-tiers-front-1', 'trois-tiers-api-1') && c.reach('trois-tiers-back-1', 'trois-tiers-api-1') },
  ],
});

/* ================================================= 6. Build dans Compose */
SC.push({
  id: 'compose-build', diff: 3, cat: 'Compose', level: 'Avancé', duration: '45 min', title: 'Compose et construction d\'images (build)',
  desc: 'Le service web utilise sa propre image, construite à partir d\'un Dockerfile du projet. Apprenez à reconstruire quand le code change.',
  objectives: ['Utiliser la clé build dans un service', 'Comprendre quand Compose construit (ou non)', 'Utiliser up --build', 'Retrouver l\'image produite'],
  parts: [
    P('build à la place de image', [
      'Un service peut, au lieu d\'une image toute faite, <b>construire la sienne</b> : <code>build: ./web</code> désigne le dossier (le <i>contexte</i>) contenant le Dockerfile. Compose appelle <code>docker build</code> pour vous et nomme l\'image <code>projet-service</code>.',
      'Point essentiel : Compose ne construit <b>qu\'une fois</b>. Si l\'image existe déjà, <code>up</code> la réutilise, <b>même si vous avez modifié le code</b>. Pour forcer la reconstruction : <code>docker compose up -d --build</code> (ou <code>docker compose build</code>).'],
    [S('Allez dans le projet : <code>cd ~/webbuild &amp;&amp; cat compose.yaml &amp;&amp; cat web/Dockerfile</code>.', 'On repère la ligne <code>build: ./web</code> et le Dockerfile du service.', 'Le service web a une clé <b>build</b> (pas de <b>image</b>) ; le Dockerfile copie index.html dans nginx.'),
     S('Lancez : <code>docker compose up -d</code>, puis <code>curl localhost:8084</code>.', 'L\'image n\'existe pas encore : Compose la construit puis démarre les conteneurs.', 'La sortie de build (étapes FROM, COPY…) puis le bloc « Running ». Le site affiche « Version 1 ».')]),
    P('Modifier le code', [
      'Changez maintenant la page. Observez d\'abord ce qui se passe avec un simple <code>up -d</code> : rien, car l\'image existe déjà.'],
    [S('Modifiez la page : <code>echo "&lt;h1&gt;Version 2&lt;/h1&gt;" &gt; web/index.html</code>, puis <code>docker compose up -d</code> et <code>curl localhost:8084</code>.', 'Pour constater le piège : Compose n\'a pas reconstruit l\'image.', 'La commande indique « Running » (rien ne change) et le site affiche toujours « Version 1 ».'),
     S('Forcez la reconstruction : <code>docker compose up -d --build</code>, puis <code>curl localhost:8084</code>.', '--build reconstruit l\'image (le cache de couches accélère) et recrée le conteneur avec la nouvelle image.', 'Le build s\'exécute, le conteneur web est recréé, et le site affiche « Version 2 ».'),
     S('Retrouvez l\'image : <code>docker images</code>.', 'L\'image construite par Compose est une image ordinaire, nommée d\'après le projet et le service.', 'Une image <code>webbuild-web</code> au tag latest.')]),
  ],
  recap: ['build: dossier construit l\'image du service ; image: ne fait que la télécharger.', 'Compose ne reconstruit pas tout seul : utilisez up --build après une modification du code.', 'L\'image est nommée projet-service.', 'Le cache de couches s\'applique comme avec docker build.'],
  build(lab) {
    W(lab, '/home/student/webbuild/compose.yaml', 'services:\n  web:\n    build: ./web\n    ports:\n      - "8084:80"\n  cache:\n    image: redis\n');
    W(lab, '/home/student/webbuild/web/Dockerfile', 'FROM nginx:alpine\nCOPY index.html /usr/share/nginx/html/index.html\n');
    W(lab, '/home/student/webbuild/web/index.html', '<h1>Version 1</h1>\n');
  },
  solve: solveWith(['cd /home/student/webbuild', 'docker compose up -d', 'curl localhost:8084', 'echo "<h1>Version 2</h1>" > web/index.html', 'docker compose up -d', 'curl localhost:8084', 'docker compose up -d --build', 'curl localhost:8084', 'docker images']),
  checks: [
    { label: 'L\'image webbuild-web a été construite par Compose', run: c => c.image('webbuild-web') },
    { label: 'L\'image contient la « Version 2 »', run: c => /Version 2/.test(c.imgFile('webbuild-web', '/usr/share/nginx/html/index.html') || '') },
    { label: 'Le conteneur webbuild-web-1 tourne, port 8084 publié', run: c => c.running('webbuild-web-1') && c.published('webbuild-web-1', 8084, 80) },
    { label: 'http://localhost:8084 affiche « Version 2 »', run: c => /Version 2/.test(c.http('http://localhost:8084').body) },
  ],
});
})(typeof window !== 'undefined' ? window : globalThis);
