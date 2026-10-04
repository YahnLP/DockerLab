/* tp_base.js — TP de base : découverte, conteneurs, données, réseau. Chaque TP mêle apports de cours, consignes, « pourquoi » et résultats attendus. */
(function (g) {
'use strict';
const NS = g.NS; const SC = NS.SCENARIOS; const P = NS.tpP, S = NS.tpS, solveWith = NS.solveWith;

/* ================================================= Découverte */
SC.push({
  id: 'decouverte', diff: 1, cat: 'Découverte', level: 'Initiation', duration: '25 min', title: 'Première rencontre avec Docker',
  desc: 'Comprendre ce qu\'est un conteneur, la différence entre image et conteneur, et lancer son premier conteneur.',
  objectives: ['Expliquer ce qu\'est un conteneur et en quoi il diffère d\'une machine virtuelle', 'Distinguer image et conteneur', 'Utiliser docker version, pull, images, run et ps'],
  parts: [
    P('Le client et le démon', [
      '<b>Docker</b> est un logiciel qui lance des applications dans des <b>conteneurs</b> : des processus isolés du reste du système, avec leur propre système de fichiers, leur propre réseau et leurs propres processus visibles. Un conteneur n\'embarque pas de système d\'exploitation complet : il partage le <b>noyau</b> de la machine hôte. C\'est pourquoi il démarre en une seconde (une machine virtuelle emporte, elle, tout un système et met des dizaines de secondes).',
      'Quand vous tapez <code>docker …</code>, vous utilisez le <b>client</b>. Il envoie vos ordres au <b>démon</b> (<code>dockerd</code>), un service qui tourne en arrière-plan et fait réellement le travail : télécharger, créer, démarrer, arrêter. Ils peuvent être sur deux machines différentes.'],
    [S('Affichez les versions : <code>docker version</code>.', 'Pour vérifier que le client sait parler au démon : si le démon est éteint, vous n\'auriez que la partie « Client » et une erreur.', 'Deux blocs : <b>Client</b> et <b>Server</b> (le démon, « Docker Engine - Community »).')]),
    P('Image et conteneur', [
      'Une <b>image</b> est un modèle <b>en lecture seule</b> : un empilement de <b>couches</b> (système de base, bibliothèques, votre application). Un <b>conteneur</b> est une <b>instance</b> en cours d\'exécution (ou arrêtée) créée à partir d\'une image, avec une fine couche d\'écriture au-dessus.',
      'Analogie : l\'image est la <i>classe</i> ou la <i>recette</i>, le conteneur est l\'<i>objet</i> ou le <i>gâteau</i>. Avec une même image, on peut créer autant de conteneurs qu\'on veut.',
      'Les images viennent d\'un <b>registre</b> (ici Docker Hub, fictif dans le simulateur). Le nom complet d\'une image est <code>dépôt:tag</code> ; sans tag, Docker prend <code>latest</code>.'],
    [S('Téléchargez l\'image <b>alpine</b> : <code>docker pull alpine</code>.', 'Alpine est une mini-distribution Linux (environ 8 Mo) très utilisée comme base. <b>pull</b> copie l\'image du registre vers votre machine, sans rien démarrer.', 'Une ligne « Pull complete » par couche, un <i>Digest</i> (empreinte unique de l\'image) et « Downloaded newer image for alpine:latest ».', [['pull', 'télécharger une image'], ['alpine', 'nom de l\'image ; équivaut à alpine:latest']]),
     S('Listez les images locales : <code>docker images</code>.', 'Pour savoir ce que vous avez déjà sous la main (et ce que ça pèse sur le disque).', 'Une ligne alpine / latest avec un IMAGE ID de 12 caractères et une taille d\'environ 8 Mo.')]),
    P('Lancer des conteneurs', [
      '<code>docker run IMAGE [COMMANDE]</code> fait en réalité trois choses : (1) télécharge l\'image si elle est absente, (2) <b>crée</b> un nouveau conteneur, (3) le <b>démarre</b> en exécutant la commande demandée (ou celle par défaut de l\'image).',
      'Le conteneur vit <b>tant que son processus principal tourne</b>. Dès que la commande se termine, le conteneur passe à l\'état <i>Exited</i>. Il n\'est pas supprimé pour autant : il reste visible avec <code>docker ps -a</code>.'],
    [S('Lancez le conteneur de test : <code>docker run hello-world</code>.', 'C\'est l\'image officielle de vérification : elle affiche un message puis s\'arrête. Comme elle est absente, Docker la télécharge tout seul (étape 1 du run).', 'Le message « Hello from Docker! » avec l\'explication des étapes.'),
     S('Lancez une commande dans alpine : <code>docker run alpine echo bonjour</code>.', 'Ici on remplace la commande par défaut de l\'image par <code>echo bonjour</code> : le conteneur exécute cette commande puis s\'arrête.', '« bonjour » s\'affiche aussitôt, sans nouveau téléchargement (l\'image est déjà là).', [['alpine', 'l\'image'], ['echo bonjour', 'la commande à exécuter dans le conteneur']]),
     S('Listez <b>tous</b> les conteneurs : <code>docker ps -a</code>.', 'Sans <code>-a</code>, <code>docker ps</code> ne montre que les conteneurs en cours d\'exécution, donc rien ici : les deux sont terminés.', 'Deux conteneurs au statut <i>Exited (0) …</i>. Le code 0 signifie « terminé sans erreur ». Remarquez aussi leurs noms inventés par Docker (adjectif_nom).', [['-a', '« all » : inclut les conteneurs arrêtés']])]),
  ],
  recap: ['Client (la commande) ≠ démon (le service qui travaille).', 'Une image est un modèle en lecture seule ; un conteneur en est une instance.', 'docker run = pull si besoin + create + start.', 'Un conteneur s\'arrête quand son processus principal se termine, mais n\'est pas supprimé : docker ps -a le montre.'],
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
  id: 'cycle-vie', diff: 1, cat: 'Découverte', level: 'Initiation', duration: '30 min', title: 'Le cycle de vie d\'un conteneur',
  desc: 'Démarrer, observer, arrêter, redémarrer et supprimer des conteneurs. Un ancien site tourne déjà sur le port 8080 : vous devez le remplacer.',
  objectives: ['Citer les états d\'un conteneur (Created, Up, Exited) et les transitions', 'Utiliser run -d, ps, logs, stop, start, rm', 'Comprendre pourquoi un port ou un nom est « déjà utilisé »'],
  parts: [
    P('Les états d\'un conteneur', [
      'Un conteneur passe par plusieurs états : <b>Created</b> (créé, pas démarré) → <b>Up</b> (en cours) → <b>Exited</b> (terminé). On peut le redémarrer (<code>start</code>) autant de fois qu\'on veut ; il garde son identité, sa configuration et ses données. Seul <code>rm</code> le détruit.',
      '<code>docker stop</code> envoie d\'abord le signal <b>SIGTERM</b> (« arrête-toi proprement ») puis, si le processus n\'obéit pas au bout de 10 secondes, <b>SIGKILL</b> (arrêt brutal, code de sortie 137). <code>docker kill</code> envoie directement SIGKILL.'],
    [S('Observez l\'état de départ : <code>docker ps -a</code>.', 'Avant d\'agir sur un système, on regarde toujours ce qui existe déjà.', 'Un conteneur <b>test</b> en cours (Up, port 8080) et un conteneur <b>ancien</b> arrêté (Exited (0)).')]),
    P('Publier un port', [
      'Un conteneur a sa propre pile réseau : un serveur web qui écoute sur son port 80 n\'est <b>pas</b> joignable depuis l\'hôte par défaut. L\'option <code>-p HÔTE:CONTENEUR</code> publie un port : <code>-p 8080:80</code> signifie « ce qui arrive sur le port 8080 de l\'hôte est envoyé au port 80 du conteneur ».',
      'Un port de l\'hôte ne peut être utilisé que par <b>un seul</b> programme à la fois. Si deux conteneurs demandent 8080, le second échoue : c\'est le conflit de port.'],
    [S('Essayez de lancer un nouveau serveur web : <code>docker run -d --name web -p 8080:80 nginx</code>.', 'On veut remplacer l\'ancien site. Mais le port 8080 est déjà pris par « test » : vous allez voir une erreur, et c\'est voulu !', 'Après le téléchargement de nginx, une erreur « Bind for 0.0.0.0:8080 failed: <b>port is already allocated</b> ».', [['-d', '« detached » : le conteneur tourne en arrière-plan et rend la main au terminal'], ['--name web', 'donne un nom lisible (sinon nom aléatoire)'], ['-p 8080:80', 'publie le port 80 du conteneur sur le port 8080 de l\'hôte'], ['nginx', 'l\'image : un serveur web']]),
     S('Regardez ce qu\'est devenu « web » : <code>docker ps -a</code>.', 'Docker a bien <b>créé</b> le conteneur avant d\'échouer à le démarrer : il reste donc dans l\'état Created et occupe le nom « web ».', 'Une ligne <b>web</b> au statut <i>Created</i>, sans ports.')]),
    P('Arrêter, supprimer, recréer', [
      'Pour libérer le port : on arrête « test ». Pour réutiliser le nom « web » : on supprime le conteneur raté. <code>docker rm</code> refuse de supprimer un conteneur qui tourne, sauf avec <code>-f</code> (force : kill puis suppression).'],
    [S('Arrêtez <b>test</b> : <code>docker stop test</code>.', 'Cela libère le port 8080. nginx comprend SIGTERM et s\'arrête immédiatement.', 'Le nom « test » s\'affiche. <code>docker ps</code> ne le montre plus.'),
     S('Supprimez le conteneur raté puis recréez-le : <code>docker rm web</code> puis <code>docker run -d --name web -p 8080:80 nginx</code>.', 'Impossible de réutiliser le nom « web » tant que l\'ancien conteneur existe, même arrêté. Le nom est libéré par la suppression.', 'Cette fois, un long identifiant (64 caractères) : le conteneur tourne.'),
     S('Testez : <code>curl http://localhost:8080</code> puis <code>docker logs web</code>.', 'curl joue le rôle d\'un navigateur : il prouve que la publication de port fonctionne. <code>logs</code> affiche ce que le processus du conteneur a écrit sur sa sortie.', 'Le HTML « Welcome to nginx! » ; dans les journaux, la ligne d\'accès « GET / HTTP/1.1 » 200.')]),
    P('Faire le ménage', [
      'Les conteneurs arrêtés s\'accumulent et occupent de la place : bonne pratique, on supprime ce dont on n\'a plus besoin. <code>docker rm</code> accepte plusieurs noms à la suite.'],
    [S('Supprimez les anciens : <code>docker rm test ancien</code>. Vérifiez avec <code>docker ps -a</code>.', 'Il ne doit rester que le conteneur « web », celui qui sert votre site.', 'Les noms supprimés s\'affichent ; seul <b>web</b> reste, en <i>Up</i>.')]),
  ],
  recap: ['Created → Up → Exited ; start le relance, rm le détruit.', 'stop = SIGTERM puis SIGKILL après 10 s ; kill = SIGKILL tout de suite.', '-p hôte:conteneur publie un port ; un port d\'hôte ne sert qu\'à un seul conteneur.', 'Un nom de conteneur est unique : il faut supprimer l\'ancien pour le réutiliser.'],
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
  id: 'nettoyage', diff: 1, cat: 'Découverte', level: 'Initiation', duration: '20 min', title: 'Faire le ménage sur un hôte encombré',
  desc: 'Un hôte Docker de développement déborde : conteneurs arrêtés, volumes oubliés, images inutilisées. Retrouvez de la place sans casser ce qui tourne.',
  objectives: ['Mesurer l\'occupation disque avec docker system df', 'Utiliser les commandes prune', 'Savoir ce qu\'un prune supprime… et ce qu\'il épargne'],
  parts: [
    P('Ce qui consomme de la place', [
      'Docker ne supprime jamais rien tout seul. Trois choses s\'accumulent : les <b>conteneurs arrêtés</b> (leur couche d\'écriture et leurs journaux), les <b>images</b> téléchargées ou construites, et les <b>volumes</b> (données persistantes). Sur une machine de développement, cela finit par représenter des gigaoctets.',
      'Les commandes <code>prune</code> suppriment ce qui est <b>inutilisé</b> : « inutilisé » veut dire qu\'aucun conteneur (en cours ou arrêté) n\'y fait référence. Elles ne touchent donc pas à ce qui sert.'],
    [S('Mesurez l\'occupation : <code>docker system df</code>, puis regardez <code>docker ps -a</code>, <code>docker volume ls</code> et <code>docker images</code>.', 'Avant de supprimer, on mesure et on regarde : un prune est irréversible.', 'Un tableau avec les colonnes TOTAL, ACTIVE, SIZE et RECLAIMABLE (« récupérable »). Un seul conteneur, <b>prod-web</b>, tourne : il ne doit surtout pas être touché.')]),
    P('Nettoyer méthodiquement', [
      '<b>L\'ordre compte</b> : une image ou un volume utilisé par un conteneur arrêté n\'est pas « inutilisé ». On supprime donc d\'abord les conteneurs, puis les volumes, puis les images.',
      'Piège classique : depuis Docker 23, <code>docker volume prune</code> ne supprime que les volumes <b>anonymes</b>. Pour les volumes <b>nommés</b> il faut ajouter <code>-a</code> (« all »), car un volume nommé a été créé volontairement.'],
    [S('Supprimez les conteneurs arrêtés : <code>docker container prune</code> (répondez <code>y</code>).', 'Docker demande confirmation car l\'opération est définitive.', 'Une liste « Deleted Containers » et « Total reclaimed space ». prod-web n\'est pas dans la liste : il tourne.'),
     S('Supprimez les volumes inutilisés : <code>docker volume prune -a</code> (répondez <code>y</code>).', 'Maintenant que les conteneurs arrêtés ont disparu, le volume « vieux-donnees » n\'est plus utilisé par personne. Avec <code>-a</code> les volumes nommés sont inclus ; celui de prod-web est épargné car il sert.', 'Seul « vieux-donnees » est supprimé.', [['-a', 'inclut les volumes nommés (pas seulement les anonymes)']]),
     S('Supprimez les images inutilisées : <code>docker image prune -a</code> (répondez <code>y</code>).', 'Sans <code>-a</code>, seules les images « dangling » (sans nom) partent. Avec <code>-a</code>, toute image qu\'aucun conteneur n\'utilise est supprimée. nginx est conservée car prod-web l\'utilise.', 'Les images alpine, busybox, redis et httpd sont supprimées ; nginx reste.'),
     S('Contrôlez : <code>docker system df</code>.', 'Pour vérifier le résultat avec la même mesure qu\'au départ.', 'La colonne RECLAIMABLE est retombée à 0 ou presque.')]),
  ],
  recap: ['Docker ne supprime rien de lui-même : à vous de nettoyer.', 'prune supprime l\'inutilisé (référencé par aucun conteneur) et épargne ce qui sert.', 'Ordre : conteneurs → volumes → images.', 'volume prune sans -a : seulement les volumes anonymes (Docker ≥ 23).'],
  build(lab) { NS.execLines(lab, ['docker volume create vieux-donnees', 'docker run -d --name prod-web -p 8080:80 -v prod-data:/data nginx', 'docker run --name tmp1 alpine echo un', 'docker run --name tmp2 -v vieux-donnees:/d alpine echo deux', 'docker run --name tmp3 busybox echo trois', 'docker pull redis:7', 'docker pull httpd']); },
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
  id: 'ports-env', diff: 2, cat: 'Conteneurs', level: 'Intermédiaire', duration: '35 min', title: 'Publier des ports et configurer par variables',
  desc: 'Deux sites web et une base de données doivent cohabiter. Le port 8080 est déjà occupé : organisez les ports et configurez PostgreSQL par variables d\'environnement.',
  objectives: ['Publier un port avec -p et éviter les conflits', 'Configurer une image avec -e', 'Diagnostiquer un démarrage raté avec docker logs'],
  parts: [
    P('Plusieurs conteneurs, un seul hôte', [
      'Chaque conteneur a sa <b>propre pile réseau</b> : deux conteneurs peuvent tous les deux écouter sur leur port 80 sans se gêner. Mais l\'hôte n\'a qu\'un seul port 8080 : en publiant, vous devez choisir des ports d\'hôte <b>différents</b> (8080, 8081…) vers le même port 80 de conteneur.',
      '<code>docker port NOM</code> rappelle la correspondance de ports d\'un conteneur.'],
    [S('Regardez ce qui tourne : <code>docker ps</code>.', 'Il faut connaître les ports déjà pris avant d\'en choisir un.', 'Le conteneur <b>site1</b> (nginx) occupe 8080.'),
     S('Lancez un second site avec Apache sur le port 8081 : <code>docker run -d --name site2 -p 8081:80 httpd</code>.', 'httpd (Apache) écoute aussi sur le port 80 <i>dans</i> son conteneur ; on le publie sur 8081 côté hôte pour éviter le conflit avec site1.', 'Un identifiant long. Testez : <code>curl localhost:8081</code> affiche « It works! ».'),
     S('Vérifiez la publication : <code>docker port site2</code>.', 'Pour lire la correspondance sans deviner.', '« 80/tcp -> 0.0.0.0:8081 »')]),
    P('Configurer un conteneur : les variables d\'environnement', [
      'Une image est un modèle <b>générique</b> : on l\'adapte au démarrage avec des <b>variables d\'environnement</b>, passées par <code>-e NOM=valeur</code>. Aucun fichier à modifier, rien à reconstruire. C\'est le mécanisme standard de configuration des conteneurs.',
      'L\'image <b>postgres</b> exige par exemple <code>POSTGRES_PASSWORD</code> (le mot de passe du super-utilisateur) ; elle accepte aussi <code>POSTGRES_DB</code> (nom d\'une base à créer). Si le mot de passe manque, le conteneur refuse de démarrer.'],
    [S('Lancez une base <b>sans</b> variable : <code>docker run -d --name db postgres</code>, puis lisez <code>docker logs db</code>.', 'C\'est volontaire : savoir lire l\'échec est une compétence essentielle. Le conteneur démarre puis s\'arrête immédiatement.', 'Dans les journaux : « Database is uninitialized and superuser password is not specified ». <code>docker ps -a</code> montre <i>Exited (1)</i> : un code différent de 0 indique une erreur.'),
     S('Supprimez-le puis recréez-le correctement : <code>docker rm db</code> puis <code>docker run -d --name db -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=appdb postgres</code>.', 'On ne peut pas ajouter une variable à un conteneur existant : on le recrée. Le nom « db » doit être libéré d\'abord.', 'Cette fois le conteneur reste <i>Up</i>. <code>docker logs db</code> se termine par « database system is ready to accept connections ».', [['-e POSTGRES_PASSWORD=secret', 'définit la variable (le mot de passe)'], ['-e POSTGRES_DB=appdb', 'crée une base nommée appdb au premier démarrage']]),
     S('Contrôlez l\'ensemble : <code>docker ps</code>.', 'Trois services doivent tourner de front.', 'site1, site2 et db en <i>Up</i>.')]),
  ],
  recap: ['Ports de conteneur identiques, ports d\'hôte différents.', '-e NOM=valeur configure un conteneur au démarrage.', 'Un conteneur qui s\'arrête aussitôt : docker logs puis le code de sortie disent pourquoi.', 'Pour changer une variable, on recrée le conteneur.'],
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
  id: 'depannage', diff: 2, cat: 'Conteneurs', level: 'Intermédiaire', duration: '30 min', title: 'Dépannage : le conteneur qui s\'arrête tout seul',
  desc: 'Une base de données ne démarre plus et un conteneur redémarre en boucle. Diagnostiquez avec ps, logs et inspect, puis réparez.',
  objectives: ['Lire l\'état et le code de sortie d\'un conteneur', 'Utiliser logs et inspect pour trouver une cause', 'Comprendre les politiques de redémarrage'],
  parts: [
    P('Méthode de diagnostic', [
      'Devant un conteneur en panne, on suit toujours le même fil : <b>1) l\'état</b> (<code>docker ps -a</code>) ; <b>2) les journaux</b> (<code>docker logs</code>) qui contiennent presque toujours le message d\'erreur ; <b>3) la configuration</b> (<code>docker inspect</code>) si le journal ne suffit pas.',
      'Le <b>code de sortie</b> donne une indication : 0 = fin normale, 1 = erreur générale de l\'application, 125-127 = Docker ou la commande n\'a pas pu démarrer, 137 = tué (SIGKILL), 143 = arrêté proprement (SIGTERM).'],
    [S('Observez : <code>docker ps -a</code>.', 'Première étape de toute enquête.', '<b>base-clients</b> est <i>Exited (1)</i> ; <b>cache-fou</b> est <i>Restarting</i>.'),
     S('Cherchez la cause : <code>docker logs base-clients</code>.', 'Le démarrage de la base a laissé un message : c\'est là qu\'on trouve la raison.', 'Un message qui commence par « Error: Database is uninitialized and superuser password is not specified ».')]),
    P('Réparer', [
      'Les variables d\'environnement d\'un conteneur sont fixées à sa création. Pour en changer, on <b>supprime et recrée</b> le conteneur (les données, elles, survivent si elles sont dans un volume).'],
    [S('Recréez la base avec un mot de passe : <code>docker rm base-clients</code> puis <code>docker run -d --name base-clients -e POSTGRES_PASSWORD=motdepasse postgres</code>.', 'La cause était le mot de passe manquant ; on le fournit avec -e, comme dans le TP précédent.', 'Le conteneur reste <i>Up</i>.')]),
    P('Les politiques de redémarrage', [
      'L\'option <code>--restart</code> dit à Docker quoi faire quand le processus s\'arrête : <code>no</code> (défaut : rien), <code>on-failure[:N]</code> (relancer si code ≠ 0, N fois au plus), <code>always</code> (toujours relancer) et <code>unless-stopped</code> (toujours, sauf si vous l\'avez arrêté vous-même).',
      'Utile pour un serveur qui doit rester disponible. Mais si le programme plante dès le départ, <b>Docker le relance indéfiniment</b>, avec un délai qui double à chaque essai : c\'est une boucle de redémarrage.'],
    [S('Observez la boucle : <code>docker ps</code> puis <code>docker inspect -f "{{.RestartCount}}" cache-fou</code>.', '<code>-f</code> (format) extrait un champ précis du JSON d\'inspect, ici le nombre de redémarrages déjà effectués.', 'Statut <i>Restarting (3)</i> et un compteur qui augmente à chaque essai.', [['inspect', 'affiche la configuration complète (JSON)'], ['-f "{{.RestartCount}}"', 'gabarit Go : ne garde que le champ RestartCount']]),
     S('Arrêtez la boucle : <code>docker rm -f cache-fou</code>.', 'Un conteneur en boucle ne se laisse pas supprimer sans <code>-f</code> (il faut d\'abord l\'arrêter).', 'Le nom s\'affiche. <code>docker ps -a</code> ne montre plus que <b>base-clients</b>, en <i>Up</i>.')]),
  ],
  recap: ['Diagnostic : ps -a → logs → inspect.', 'Code de sortie ≠ 0 : erreur ; 137 = SIGKILL.', 'Les variables d\'un conteneur se changent en le recréant.', '--restart always relance sans fin un programme qui plante : surveillez RestartCount.'],
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
  id: 'volume-nomme', diff: 2, cat: 'Données', level: 'Intermédiaire', duration: '35 min', title: 'Volumes : garder ses données quand le conteneur disparaît',
  desc: 'Un conteneur est jetable, pas ses données. Faites survivre un site web à la suppression de son conteneur grâce à un volume nommé.',
  objectives: ['Expliquer pourquoi les données d\'un conteneur sont éphémères', 'Créer et monter un volume nommé', 'Prouver la persistance en recréant le conteneur'],
  parts: [
    P('Pourquoi des volumes ?', [
      'Tout ce qu\'un conteneur écrit dans son système de fichiers va dans sa fine <b>couche d\'écriture</b>, qui est <b>détruite avec le conteneur</b>. C\'est voulu : on peut jeter et recréer un conteneur à volonté. Mais pour une base de données ou un site modifiable, il faut des données qui <b>survivent</b>.',
      'Un <b>volume</b> est un espace de stockage géré par Docker, indépendant des conteneurs. On le <b>monte</b> à un endroit du conteneur avec <code>-v NOM:CHEMIN</code> : tout ce qui est écrit dans ce dossier va dans le volume. Quand le conteneur disparaît, le volume reste et peut être remonté dans un autre.',
      'Au tout premier montage d\'un volume vide, Docker le <b>remplit avec le contenu que l\'image avait déjà à cet endroit</b> (ici la page d\'accueil de nginx).'],
    [S('Créez le volume : <code>docker volume create site</code> puis <code>docker volume ls</code>.', 'On pourrait laisser <code>run</code> le créer automatiquement ; le créer soi-même rend l\'étape visible.', 'Une ligne <code>local  site</code> dans la liste.', [['volume create site', 'crée un volume nommé « site »'], ['local', 'pilote de stockage : sur le disque de l\'hôte']]),
     S('Lancez nginx avec ce volume : <code>docker run -d --name web -p 8080:80 -v site:/usr/share/nginx/html nginx</code>.', '/usr/share/nginx/html est le dossier que nginx publie. En y montant le volume, on rend le site persistant.', 'Un identifiant long, puis <code>curl localhost:8080</code> affiche la page nginx par défaut (copiée dans le volume au premier montage).', [['-v site:/usr/share/nginx/html', 'monte le volume « site » sur ce dossier du conteneur']])]),
    P('Modifier puis détruire', [
      'On va maintenant écrire dans le volume depuis l\'intérieur du conteneur avec <code>docker exec</code> (exécuter une commande dans un conteneur <b>déjà en cours</b>), puis détruire le conteneur pour vérifier que la donnée survit.'],
    [S('Changez la page : <code>docker exec web sh -c "echo Bonjour de Formaxion &gt; /usr/share/nginx/html/index.html"</code> puis <code>curl localhost:8080</code>.', 'On passe par <code>sh -c</code> pour que la redirection <code>&gt;</code> soit exécutée <i>dans</i> le conteneur et non sur l\'hôte.', 'curl affiche « Bonjour de Formaxion ».', [['exec web', 'exécute dans le conteneur « web »'], ['sh -c "…"', 'lance un shell qui exécute la chaîne entre guillemets']]),
     S('<b>Expérience :</b> supprimez le conteneur : <code>docker rm -f web</code>, puis <code>docker volume ls</code>.', 'On détruit le conteneur pour voir si la donnée disparaît avec lui.', 'Le conteneur a disparu, mais le volume <b>site</b> est toujours là.'),
     S('Recréez un conteneur <b>web2</b> avec le <b>même volume</b> : <code>docker run -d --name web2 -p 8080:80 -v site:/usr/share/nginx/html nginx</code>, puis <code>curl localhost:8080</code>.', 'Un nouveau conteneur, une nouvelle couche d\'écriture — mais le volume est le même.', 'curl affiche toujours « Bonjour de Formaxion » : la donnée a survécu.')]),
    P('Pour comparer : sans volume', [
      'Sans <code>-v</code>, ce qu\'on écrit disparaît avec le conteneur. <code>--rm</code> supprime le conteneur à sa fin, ce qui rend l\'expérience immédiate.'],
    [S('Essayez : <code>docker run --rm alpine sh -c "echo x &gt; /f; cat /f"</code> puis <code>docker run --rm alpine cat /f</code>.', 'Le premier conteneur écrit et lit son fichier ; le second est un conteneur neuf, sans ce fichier.', 'Le premier affiche « x » ; le second : « cat: can\'t open \'/f\': No such file or directory ».')]),
  ],
  recap: ['Les données écrites dans un conteneur sont détruites avec lui.', 'Un volume (-v nom:chemin) vit indépendamment des conteneurs.', 'Premier montage : le volume est initialisé avec le contenu de l\'image.', 'docker exec lance une commande dans un conteneur en cours d\'exécution.'],
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
  id: 'bind-mount', diff: 2, cat: 'Données', level: 'Intermédiaire', duration: '35 min', title: 'Monter un dossier de l\'hôte (bind mount)',
  desc: 'En développement, on édite ses fichiers sur l\'hôte et on veut les voir aussitôt dans le conteneur : c\'est le rôle du bind mount.',
  objectives: ['Distinguer volume nommé et bind mount', 'Monter un dossier de l\'hôte, en lecture seule', 'Comprendre qu\'un montage masque le contenu de l\'image'],
  parts: [
    P('Volume ou bind mount ?', [
      'Un <b>bind mount</b> relie un dossier <b>précis de l\'hôte</b> à un dossier du conteneur : <code>-v /chemin/hôte:/chemin/conteneur</code>. Les deux voient exactement les mêmes fichiers. C\'est idéal en développement (vous éditez avec votre éditeur habituel, le conteneur voit la modification immédiatement).',
      'Différences avec un volume nommé : le bind mount utilise un chemin que <b>vous</b> choisissez (le volume est géré par Docker) ; il <b>masque</b> le contenu de l\'image à cet endroit (le volume est initialisé avec lui) ; il dépend de l\'organisation de l\'hôte, donc il est moins portable.',
      'Ajouter <code>:ro</code> monte en <b>lecture seule</b> : le conteneur peut lire mais pas modifier. Bonne pratique de sécurité pour du contenu qu\'il n\'a pas à changer.'],
    [S('Créez un dossier de travail : <code>mkdir -p ~/monsite &amp;&amp; cd ~/monsite</code>.', 'Il faut d\'abord un dossier sur l\'hôte à partager. <code>~</code> désigne votre dossier personnel (/home/student).', 'L\'invite devient <code>student@dockerlab:~/monsite$</code>.'),
     S('Écrivez une page : <code>echo "&lt;h1&gt;Mon site&lt;/h1&gt;" &gt; index.html</code>.', 'Le fichier est créé <b>sur l\'hôte</b> ; ouvrez aussi l\'onglet « Fichiers de l\'hôte » ou tapez <code>nano index.html</code> pour le modifier à la main.', '<code>cat index.html</code> affiche « &lt;h1&gt;Mon site&lt;/h1&gt; ».')]),
    P('Monter le dossier', [
      'Le chemin de l\'hôte doit être <b>absolu</b> (commence par <code>/</code>). Le shell remplace <code>~</code> par <code>/home/student</code> avant de passer la commande à Docker.'],
    [S('Lancez nginx avec le dossier monté en lecture seule : <code>docker run -d --name dev -p 8080:80 -v ~/monsite:/usr/share/nginx/html:ro nginx</code>.', 'Le dossier du site de nginx est remplacé par votre dossier, que nginx ne pourra pas modifier.', 'Un identifiant long. <code>curl localhost:8080</code> affiche <b>Mon site</b> et non « Welcome to nginx » : le montage a <i>masqué</i> la page de l\'image.', [['~/monsite:/usr/share/nginx/html', 'dossier de l\'hôte : dossier du conteneur'], [':ro', '« read-only » : lecture seule']]),
     S('Modifiez la page sur l\'hôte : <code>echo "&lt;h1&gt;Mon site v2&lt;/h1&gt;" &gt; index.html</code>, puis <code>curl localhost:8080</code>.', 'Pour constater l\'intérêt du bind mount en développement : aucun redémarrage ni reconstruction.', 'curl affiche immédiatement « Mon site v2 ».'),
     S('Tentez d\'écrire depuis le conteneur : <code>docker exec dev sh -c "echo x &gt; /usr/share/nginx/html/test.txt"</code>.', 'Pour vérifier que <code>:ro</code> protège le dossier.', 'Une erreur : « Read-only file system ».')]),
  ],
  recap: ['Bind mount = un dossier choisi de l\'hôte ; volume = stockage géré par Docker.', 'Un montage masque le contenu de l\'image à cet emplacement.', ':ro empêche le conteneur d\'écrire.', 'Le chemin de l\'hôte doit être absolu.'],
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
  id: 'reseau-dns', diff: 2, cat: 'Réseau', level: 'Intermédiaire', duration: '35 min', title: 'Réseaux Docker : faire dialoguer deux conteneurs par leur nom',
  desc: 'Une API et un client tournent sur le réseau par défaut et ne peuvent pas se joindre par leur nom. Créez un réseau dédié pour activer le DNS interne de Docker.',
  objectives: ['Décrire le réseau bridge par défaut et ses limites', 'Créer un réseau défini par l\'utilisateur', 'Utiliser la résolution de noms de Docker', 'Connecter un conteneur existant à un réseau'],
  parts: [
    P('Les réseaux Docker', [
      'Docker crée pour chaque hôte un réseau virtuel par défaut appelé <b>bridge</b> (sous-réseau 172.17.0.0/16). Chaque conteneur y reçoit une adresse IP et peut joindre les autres <b>par leur adresse IP</b>. Problème : les adresses changent à chaque recréation, et sur ce réseau par défaut <b>il n\'y a pas de résolution de noms</b>.',
      'La solution est de créer un <b>réseau bridge défini par l\'utilisateur</b> : Docker y fournit un <b>DNS interne</b> (le serveur 127.0.0.11 vu depuis les conteneurs) qui traduit le <b>nom du conteneur</b> en adresse IP. Un client joint alors l\'API par <code>http://api</code>, quelle que soit son adresse. De plus, les conteneurs de réseaux différents sont <b>isolés</b> les uns des autres.'],
    [S('Observez : <code>docker ps</code> et <code>docker network ls</code>.', 'Pour connaître les réseaux disponibles et l\'état de départ.', 'Deux conteneurs, <b>api</b> (nginx) et <b>client</b> (alpine), et les réseaux par défaut bridge, host et none.'),
     S('Entrez dans le client : <code>docker exec -it client sh</code>, puis tapez <code>wget -qO- http://api</code>, puis <code>exit</code>.', '<code>-it</code> ouvre un terminal interactif <i>dans</i> le conteneur : l\'invite change. wget joue le rôle d\'un client web ; on tente de joindre « api » par son nom.', 'Une erreur « wget: bad address \'api\' » : le nom n\'est pas résolu sur le réseau par défaut. <code>exit</code> ramène à l\'hôte.', [['-i', 'garde l\'entrée standard ouverte (interactif)'], ['-t', 'alloue un pseudo-terminal'], ['wget -qO-', 'télécharge et affiche la page (-q silencieux, -O- vers la sortie)']])]),
    P('Créer le réseau et y connecter les conteneurs', [
      '<code>docker network create NOM</code> crée un réseau bridge utilisateur. <code>docker network connect RÉSEAU CONTENEUR</code> y branche un conteneur <b>déjà existant</b> (un conteneur peut être sur plusieurs réseaux à la fois). On peut aussi directement lancer avec <code>docker run --network NOM</code>.'],
    [S('Créez le réseau : <code>docker network create app-net</code>, puis regardez-le : <code>docker network inspect app-net</code>.', 'On crée le réseau qui portera le DNS interne.', 'Un identifiant, puis un JSON avec le sous-réseau (172.18.0.0/16), la passerelle et, pour l\'instant, aucun conteneur.'),
     S('Branchez les deux conteneurs : <code>docker network connect app-net api</code> puis <code>docker network connect app-net client</code>.', 'Chaque conteneur reçoit une seconde adresse, sur app-net, et s\'enregistre dans le DNS interne sous son nom.', 'Aucun message : les commandes réussissent en silence.'),
     S('Retestez depuis le client : <code>docker exec client wget -qO- http://api</code>.', 'Maintenant que les deux conteneurs partagent app-net, « api » est résolu par le DNS de Docker.', 'Le HTML de la page « Welcome to nginx! ».'),
     S('Regardez les adresses : <code>docker inspect -f \'{{range $k,$v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}\' api</code>.', 'Pour voir qu\'un conteneur peut avoir une adresse par réseau.', '« bridge=172.17.0.2 app-net=172.18.0.2 » : deux adresses.', [['range $k,$v := …', 'boucle sur la liste des réseaux (clé k, valeur v)'], ['{{$v.IPAddress}}', 'l\'adresse IP du conteneur sur ce réseau']])]),
  ],
  recap: ['Le réseau bridge par défaut : IP oui, noms non.', 'Un réseau utilisateur ajoute le DNS interne : on joint un conteneur par son nom.', 'network connect branche un conteneur existant ; un conteneur peut avoir plusieurs réseaux.', 'Des réseaux différents isolent les conteneurs entre eux.'],
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
  id: 'isolation', diff: 3, cat: 'Réseau', level: 'Avancé', duration: '45 min', title: 'Isoler deux applications avec un conteneur passerelle',
  desc: 'Deux applications (« compta » et « rh ») ne doivent pas se voir. Seul un conteneur « passerelle » peut parler aux deux.',
  objectives: ['Créer deux réseaux isolés', 'Rattacher un conteneur à plusieurs réseaux', 'Vérifier l\'isolation avec wget et ping', 'Expliquer le DNS par réseau'],
  parts: [
    P('Isolation par les réseaux', [
      'Deux conteneurs placés sur des réseaux Docker <b>différents</b> ne peuvent pas communiquer : ni par nom, ni par adresse IP. C\'est le moyen le plus simple de cloisonner des applications sur un même hôte (principe du <b>moindre privilège</b> réseau).',
      'Quand un conteneur doit parler à deux mondes (un proxy, une passerelle d\'administration), on le rattache aux <b>deux réseaux</b> : il devient le seul pont. Le DNS interne est propre à chaque réseau : un nom n\'est résolu que pour les conteneurs du même réseau.'],
    [S('Créez deux réseaux : <code>docker network create reseau-compta</code> et <code>docker network create reseau-rh</code>.', 'Un réseau par application, c\'est le cloisonnement de base.', 'Un identifiant par commande ; <code>docker network ls</code> liste les deux réseaux.'),
     S('Lancez les deux applications : <code>docker run -d --name compta --network reseau-compta nginx</code> et <code>docker run -d --name rh --network reseau-rh nginx</code>.', 'L\'option <code>--network</code> choisit le réseau dès la création (au lieu du bridge par défaut).', 'Deux identifiants. Aucun des deux n\'est sur le réseau de l\'autre.', [['--network reseau-compta', 'attache le conteneur à ce réseau à la création']]),
     S('Lancez le conteneur de test : <code>docker run -d --name passerelle --network reseau-compta alpine sleep 3600</code>.', '<code>sleep 3600</code> garde ce conteneur vivant pendant une heure pour qu\'on puisse y faire des tests.', 'Un identifiant ; <code>docker ps</code> montre trois conteneurs.')]),
    P('Tester l\'isolation, puis ouvrir le pont', [
      'On teste toujours une règle d\'isolation <b>dans les deux sens</b> : ce qui doit marcher marche, ce qui doit échouer échoue. Le test se fait depuis un conteneur du réseau concerné.'],
    [S('Depuis <b>passerelle</b>, joignez <b>compta</b> : <code>docker exec passerelle wget -qO- http://compta</code>.', 'Même réseau : le DNS résout le nom.', 'Le HTML « Welcome to nginx! ».'),
     S('Tentez ensuite <b>rh</b> : <code>docker exec passerelle wget -qO- -T 2 http://rh</code>.', 'Réseaux différents : le nom n\'existe pas pour passerelle. <code>-T 2</code> limite l\'attente à 2 s.', 'Une erreur « wget: bad address \'rh\' » : isolation effective.'),
     S('Donnez à passerelle un second pied : <code>docker network connect reseau-rh passerelle</code>, puis retentez <code>docker exec passerelle wget -qO- http://rh</code>.', 'En rejoignant reseau-rh, passerelle devient visible des deux côtés et peut résoudre « rh ».', 'Cette fois le HTML de nginx s\'affiche.'),
     S('Vérifiez le cloisonnement : <code>docker network inspect reseau-rh</code>.', 'On contrôle qui est branché sur quoi.', 'La section <i>Containers</i> ne liste que <b>rh</b> et <b>passerelle</b> : <b>compta</b> reste isolé de rh.')]),
  ],
  recap: ['Réseaux différents = conteneurs isolés (noms et IP).', 'Un conteneur sur deux réseaux est un pont ; à utiliser avec parcimonie.', 'Le DNS interne ne résout que les noms du même réseau.', 'On teste une isolation dans les deux sens.'],
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
})(typeof window !== 'undefined' ? window : globalThis);
