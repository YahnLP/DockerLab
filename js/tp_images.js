/* tp_images.js — TP « Images et Dockerfile » : construire ses propres images. */
(function (g) {
'use strict';
const NS = g.NS; const SC = NS.SCENARIOS; const P = NS.tpP, S = NS.tpS, solveWith = NS.solveWith;
const W = (lab, p, d) => { lab.hostFs.writep(p, d); };

/* ================================================= Dockerfile 1 */
SC.push({
  id: 'dockerfile-1', diff: 2, cat: 'Images', level: 'Intermédiaire', duration: '40 min', title: 'Votre première image : un Dockerfile pour un site web',
  desc: 'Le dossier ~/projet-web contient une page HTML. Écrivez un Dockerfile qui l\'embarque dans une image nginx, construisez l\'image et lancez-la.',
  objectives: ['Expliquer le rôle d\'un Dockerfile et d\'une image', 'Écrire FROM et COPY', 'Construire une image avec docker build -t', 'Lire l\'historique des couches'],
  parts: [
    P('Du code à l\'image', [
      'Une <b>image</b> est un modèle en lecture seule, composé de <b>couches</b> empilées. Un <b>Dockerfile</b> est la « recette » : un fichier texte dont chaque <b>instruction</b> ajoute une couche. <code>docker build</code> lit cette recette et fabrique l\'image : c\'est reproductible, versionnable avec le code, et identique chez tout le monde.',
      'Les deux instructions de base : <code>FROM image</code> choisit l\'image de départ (obligatoire, toujours en premier) ; <code>COPY source destination</code> copie des fichiers du <b>contexte de build</b> (le dossier que l\'on donne à docker build) dans l\'image.'],
    [S('Allez dans le projet et regardez son contenu : <code>cd ~/projet-web &amp;&amp; ls</code>.', 'Le contexte de build est le dossier envoyé à Docker : on commence par voir ce qu\'il contient.', 'Un fichier <code>index.html</code>.'),
     S('Créez le Dockerfile : <code>nano Dockerfile</code> puis saisissez les deux lignes <code>FROM nginx:alpine</code> et <code>COPY index.html /usr/share/nginx/html/index.html</code> (Ctrl+O, Entrée, Ctrl+X). Vérifiez avec <code>cat Dockerfile</code>.', 'Le fichier doit s\'appeler exactement <b>Dockerfile</b> (majuscule initiale) pour être trouvé automatiquement. On part de nginx:alpine, une version légère, et on remplace sa page d\'accueil par la nôtre.', '<code>cat</code> affiche vos deux lignes.', [['FROM nginx:alpine', 'image de départ, avec son « tag » (version) alpine'], ['COPY index.html /usr/share/…', 'copie du contexte vers le chemin absolu indiqué dans l\'image']])]),
    P('Construire et lancer', [
      '<code>docker build -t NOM:TAG CONTEXTE</code> construit l\'image. <code>-t</code> la <b>nomme</b> (sans nom, elle n\'a qu\'un identifiant). Le point <code>.</code> désigne le dossier courant comme contexte. Docker affiche une étape par instruction.'],
    [S('Construisez : <code>docker build -t monsite:1.0 .</code>.', 'Transforme la recette en image locale nommée « monsite » version 1.0.', 'Une étape par instruction (FROM, COPY), puis « naming to docker.io/library/monsite:1.0 ».', [['-t monsite:1.0', 'nom et tag de l\'image produite'], ['.', 'contexte de build : le dossier courant']]),
     S('Vérifiez : <code>docker images monsite</code>.', 'Pour constater que l\'image existe maintenant sur l\'hôte, comme une image téléchargée.', 'Une ligne « monsite 1.0 » avec sa taille.'),
     S('Lancez-la : <code>docker run -d --name vitrine -p 8080:80 monsite:1.0</code>, puis <code>curl localhost:8080</code>.', 'Une image se lance comme n\'importe quelle autre ; elle contient maintenant votre page.', 'Le contenu de votre index.html (et non « Welcome to nginx »).')]),
    P('Lire les couches', [
      'Chaque instruction crée une <b>couche</b> ; les couches sont mises en <b>cache</b> et partagées entre images. <code>docker history</code> les affiche de la plus récente à la plus ancienne avec la commande qui les a créées.'],
    [S('Affichez l\'historique : <code>docker history monsite:1.0</code>.', 'Pour voir que votre COPY est une couche au-dessus de celles de nginx.', 'La couche « COPY index.html … » en haut, de très petite taille, au-dessus des couches de nginx:alpine.')]),
  ],
  recap: ['Dockerfile = recette ; image = résultat ; conteneur = image en cours d\'exécution.', 'FROM choisit la base, COPY apporte des fichiers du contexte.', 'docker build -t nom:tag . construit ; docker history montre les couches.'],
  build(lab) { W(lab, '/home/student/projet-web/index.html', '<h1>Formaxion Landes</h1><p>Mon premier site conteneurisé</p>\n'); },
  solve: solveWith(['cd /home/student/projet-web', 'printf "FROM nginx:alpine\\nCOPY index.html /usr/share/nginx/html/index.html\\n" > Dockerfile', 'docker build -t monsite:1.0 .', 'docker run -d --name vitrine -p 8080:80 monsite:1.0', 'docker history monsite:1.0']),
  checks: [
    { label: 'Un Dockerfile existe dans ~/projet-web et commence par FROM', run: c => /^\s*FROM\s/m.test(c.hostFile('/home/student/projet-web/Dockerfile') || '') },
    { label: 'L\'image monsite:1.0 existe', run: c => c.image('monsite:1.0') },
    { label: 'Elle contient votre page', run: c => /Formaxion/.test(c.imgFile('monsite:1.0', '/usr/share/nginx/html/index.html') || '') },
    { label: 'Un conteneur issu de monsite:1.0 tourne, port 8080 publié', run: c => c.lab.containers.some(x => x.running && x.imageRef.startsWith('monsite') && c.published(x.name, 8080, 80)) },
    { label: 'http://localhost:8080 affiche votre page', run: c => /Formaxion/.test(c.http('http://localhost:8080').body) },
  ],
});

/* ================================================= Dockerfile 2 */
SC.push({
  id: 'dockerfile-2', diff: 2, cat: 'Images', level: 'Intermédiaire', duration: '45 min', title: 'Dockerfile : RUN, ENV, WORKDIR, CMD',
  desc: 'Construisez une petite image alpine qui installe curl, définit une variable, et exécute un script de salutation configurable.',
  objectives: ['Utiliser RUN, ENV, WORKDIR, COPY, CMD', 'Distinguer l\'étape de construction de l\'étape d\'exécution', 'Surcharger une variable ou la commande au docker run'],
  parts: [
    P('Construction ou exécution ?', [
      'Il faut distinguer deux moments. Au <b>build</b> : <code>RUN</code> exécute une commande dont le résultat est figé dans une couche (installer un paquet…), <code>ENV</code> fixe une variable d\'environnement par défaut, <code>WORKDIR</code> fixe le dossier de travail (et le crée). Au <b>run</b> : <code>CMD</code> définit la commande lancée au démarrage du conteneur — <i>elle ne s\'exécute pas pendant le build</i>.',
      'Le <code>CMD</code> n\'est qu\'une valeur par défaut : tout ce qui suit le nom de l\'image dans <code>docker run</code> la remplace. Préférez la forme « exec » en JSON : <code>CMD ["sh", "salut.sh"]</code>.'],
    [S('Allez dans le dossier : <code>cd ~/projet-salut &amp;&amp; cat salut.sh</code>.', 'Le script que l\'image devra exécuter est déjà fourni ; on le lit pour savoir quelle variable il utilise.', 'Un script qui affiche « Bonjour » suivi de la variable NOM.')]),
    P('Écrire le Dockerfile', [
      'L\'ordre compte : on met en haut ce qui change rarement (base, paquets) et en bas ce qui change souvent (vos fichiers) — nous verrons pourquoi dans le TP sur le cache.'],
    [S('Créez le fichier Dockerfile (avec <code>nano Dockerfile</code>) contenant : <code>FROM alpine:3.20</code>, <code>RUN apk add --no-cache curl</code>, <code>ENV NOM=monde</code>, <code>WORKDIR /app</code>, <code>COPY salut.sh .</code>, <code>CMD ["sh", "salut.sh"]</code>.', 'Chaque ligne a un rôle : base, outil installé dans l\'image, valeur par défaut configurable, dossier de travail, fichier applicatif, commande de démarrage.', '<code>cat Dockerfile</code> affiche les six lignes.', [['apk add --no-cache', 'installe un paquet Alpine sans conserver le cache de l\'index (image plus légère)'], ['WORKDIR /app', 'les instructions suivantes (et le conteneur) démarrent dans /app'], ['COPY salut.sh .', 'le « . » est le WORKDIR : le script arrive dans /app']]),
     S('Construisez : <code>docker build -t salut:1 .</code>.', 'RUN s\'exécute maintenant, dans un conteneur temporaire, pour installer curl.', 'Une étape par instruction, dont le RUN apk add.')]),
    P('Exécuter et surcharger', [
      'Une variable définie par <code>ENV</code> est visible dans le conteneur, mais on peut la <b>changer sans reconstruire</b> avec <code>-e</code> : c\'est le moyen standard de configurer une application.'],
    [S('Lancez : <code>docker run --rm salut:1</code>.', '<code>--rm</code> supprime le conteneur à sa fin. Le CMD du Dockerfile est exécuté.', '« Bonjour monde ».'),
     S('Changez la variable : <code>docker run --rm -e NOM=Formaxion salut:1</code>.', 'Pour constater que ENV n\'est qu\'une valeur par défaut, remplaçable à l\'exécution.', '« Bonjour Formaxion ».'),
     S('Surchargez la commande : <code>docker run --rm salut:1 curl --version</code>.', 'Ce qui suit le nom de l\'image remplace le CMD ; cela prouve aussi que curl a bien été installé à la construction.', 'La version de curl, et non « Bonjour ».')]),
  ],
  recap: ['RUN, ENV, WORKDIR, COPY s\'exécutent au build ; CMD s\'exécute au run.', 'ENV donne une valeur par défaut, -e la remplace sans reconstruire.', 'Une commande après le nom de l\'image remplace CMD.'],
  build(lab) { W(lab, '/home/student/projet-salut/salut.sh', 'echo "Bonjour $NOM"\n'); },
  solve: solveWith(['cd /home/student/projet-salut', 'printf "FROM alpine:3.20\\nRUN apk add --no-cache curl\\nENV NOM=monde\\nWORKDIR /app\\nCOPY salut.sh .\\nCMD [\\"sh\\", \\"salut.sh\\"]\\n" > Dockerfile', 'docker build -t salut:1 .', 'docker run --rm salut:1', 'docker run --rm -e NOM=Formaxion salut:1']),
  checks: [
    { label: 'L\'image salut:1 existe', run: c => c.image('salut:1') },
    { label: 'curl est installé dans l\'image (RUN apk add)', run: c => c.imgPkg('salut:1', 'curl') },
    { label: 'La variable NOM=monde est définie dans l\'image (ENV)', run: c => { const i = c.img('salut:1'); return !!i && ((i.config && i.config.env) || []).some(e => e === 'NOM=monde'); } },
    { label: 'Le script est dans /app (WORKDIR + COPY)', run: c => /NOM/.test(c.imgFile('salut:1', '/app/salut.sh') || '') },
  ],
});

/* ================================================= Cache */
SC.push({
  id: 'dockerfile-cache', diff: 3, cat: 'Images', level: 'Avancé', duration: '45 min', title: 'Le cache de build : bien ordonner son Dockerfile',
  desc: 'Une application Python est construite avec un Dockerfile mal ordonné : chaque modification du code réinstalle toutes les dépendances. Corrigez l\'ordre des instructions.',
  objectives: ['Expliquer le fonctionnement du cache de couches', 'Repérer les étapes CACHED', 'Réordonner un Dockerfile pour en tirer parti'],
  parts: [
    P('Le cache de couches', [
      'Docker garde chaque couche construite. Au build suivant, si l\'instruction <b>et les fichiers qu\'elle utilise</b> n\'ont pas changé, il réutilise la couche : l\'étape est marquée <code>CACHED</code> et ne coûte rien. Mais dès qu\'une couche est invalidée, <b>toutes les suivantes sont reconstruites</b>.',
      'Conséquence : on place en premier ce qui change rarement (la liste des dépendances), puis installer, et en dernier le code source qui change à chaque commit. Ainsi, modifier le code ne réinstalle pas les dépendances.'],
    [S('Allez dans le projet : <code>cd ~/projet-api &amp;&amp; ls &amp;&amp; cat Dockerfile</code>.', 'On commence par lire le Dockerfile existant pour repérer son défaut.', 'Un Dockerfile qui fait <code>COPY . .</code> <b>avant</b> <code>RUN pip install</code>.')]),
    P('Constater le problème', [
      'Le premier build ne peut rien réutiliser. C\'est le deuxième build, après une modification, qui révèle l\'efficacité du cache.'],
    [S('Construisez : <code>docker build -t api:1 .</code>.', 'Premier build : toutes les étapes sont exécutées.', 'Aucune mention CACHED.'),
     S('Modifiez le code : <code>echo "print(\'v2\')" &gt;&gt; app.py</code>, puis relancez <code>docker build -t api:2 .</code>.', 'Un simple changement de code devrait être rapide.', 'L\'étape <code>RUN pip install</code> est <b>refaite</b> (pas de CACHED) alors que les dépendances n\'ont pas changé : c\'est le défaut.', [])]),
    P('Corriger l\'ordre', [
      'Solution : copier d\'abord <b>uniquement</b> <code>requirements.txt</code>, installer, puis copier le reste du code.'],
    [S('Remplacez le Dockerfile par : <code>FROM python:3.12-slim</code>, <code>WORKDIR /app</code>, <code>COPY requirements.txt .</code>, <code>RUN pip install -r requirements.txt</code>, <code>COPY . .</code>, <code>CMD ["python", "app.py"]</code>.', 'L\'installation ne dépend plus que de requirements.txt : tant qu\'il ne change pas, la couche reste en cache.', '<code>cat Dockerfile</code> montre le nouvel ordre.'),
     S('Construisez, modifiez le code, reconstruisez : <code>docker build -t api:3 .</code>, <code>echo "print(\'v4\')" &gt;&gt; app.py</code>, <code>docker build -t api:4 .</code>.', 'Pour vérifier le gain.', 'Au dernier build, <code>RUN pip install</code> affiche <b>CACHED</b>.')]),
  ],
  recap: ['Une couche invalidée invalide toutes les suivantes.', 'Dépendances d\'abord, code ensuite.', 'CACHED dans la sortie de build = couche réutilisée.'],
  build(lab) {
    W(lab, '/home/student/projet-api/app.py', 'print("API démarrée")\n');
    W(lab, '/home/student/projet-api/requirements.txt', 'flask==3.0.3\nrequests==2.32.3\n');
    W(lab, '/home/student/projet-api/Dockerfile', 'FROM python:3.12-slim\nWORKDIR /app\nCOPY . .\nRUN pip install -r requirements.txt\nCMD ["python", "app.py"]\n');
  },
  solve: solveWith(['cd /home/student/projet-api', 'docker build -t api:1 .', 'echo "print(\'v2\')" >> app.py', 'docker build -t api:2 .', 'printf "FROM python:3.12-slim\\nWORKDIR /app\\nCOPY requirements.txt .\\nRUN pip install -r requirements.txt\\nCOPY . .\\nCMD [\\"python\\", \\"app.py\\"]\\n" > Dockerfile', 'docker build -t api:3 .', 'echo "print(\'v4\')" >> app.py', 'docker build -t api:4 .']),
  checks: [
    { label: 'Dans le Dockerfile, requirements.txt est copié avant d\'installer, et le code après', run: c => { const t = c.hostFile('/home/student/projet-api/Dockerfile') || ''; const a = t.search(/COPY\s+requirements\.txt/), b = t.search(/RUN\s+pip install/), d = t.search(/COPY\s+\.\s+\./); return a >= 0 && b > a && d > b; } },
    { label: 'Le dernier build a réutilisé le cache pour pip install', run: c => { const b = c.lastBuild(); return !!b && b.ok && b.steps.some(s => /pip install/.test(s.label) && s.cached); } },
    { label: 'Une image api existe', run: c => c.image('api:3') || c.image('api:4') },
  ],
});
})(typeof window !== 'undefined' ? window : globalThis);
