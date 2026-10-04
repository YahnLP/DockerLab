// Tests du moteur Docker simulé : cycle de vie, erreurs fidèles, ports, volumes, réseaux, shell des conteneurs
const { NS, mkLab, run } = require('./helpers');
let bad = 0, n = 0;
function T(name, cond, info) { n++; if (!cond) { bad++; console.log('FAIL ' + name + (info ? '\n' + info : '')); } }
const has = (s, x) => s.includes(x);

/* ---- cycle de vie nginx ---- */
{
  const e = mkLab(); const { lab } = e;
  let o = run(e, ['docker run -d --name web -p 8080:80 nginx']);
  T('run -d : image téléchargée', has(o, 'Unable to find image \'nginx:latest\' locally') && has(o, 'Status: Downloaded newer image for nginx:latest'), o);
  T('run -d : affiche l\'ID complet', /\n[0-9a-f]{64}\n$/.test(o), o);
  T('run : pas de « Using default tag »', !has(o, 'Using default tag'));
  o = run(e, 'docker ps');
  T('ps : colonnes et ports', /CONTAINER ID {3}IMAGE {5}COMMAND {18}CREATED/.test(o) && has(o, '0.0.0.0:8080->80/tcp, [::]:8080->80/tcp') && has(o, '"/docker-entrypoint.…"') && /web\n$/.test(o), o);
  o = run(e, 'curl localhost:8080');
  T('curl : page par défaut nginx', has(o, '<title>Welcome to nginx!</title>'), o);
  o = run(e, 'curl -I localhost:8080');
  T('curl -I : en-têtes', has(o, 'HTTP/1.1 200 OK') && has(o, 'Server: nginx/1.27.2') && has(o, 'Content-Length: 615'), o);
  o = run(e, 'curl localhost:9999');
  T('curl : connexion refusée', has(o, 'curl: (7) Failed to connect to localhost port 9999 after 0 ms: Couldn\'t connect to server'), o);
  o = run(e, 'docker logs web');
  T('logs : démarrage + accès', has(o, 'Configuration complete; ready for start up') && /172\.17\.0\.1 - - \[04\/Oct\/2026:\d\d:\d\d:\d\d \+0000\] "GET \/ HTTP\/1\.1" 200 615/.test(o), o);
  o = run(e, 'docker rm web');
  T('rm : conteneur en cours refusé', has(o, 'Error response from daemon: cannot remove container "/web": container is running: stop the container before removing or force remove'), o);
  o = run(e, 'docker stop web');
  T('stop : affiche le nom', o === 'web\n', o);
  o = run(e, 'docker ps -a');
  T('ps -a : Exited (0)', /Exited \(0\) \d+ seconds? ago/.test(o), o);
  o = run(e, 'curl localhost:8080');
  T('curl après stop : refusé', has(o, 'curl: (7)'), o);
  o = run(e, 'docker start web');
  T('start : affiche le nom', o === 'web\n', o);
  o = run(e, 'curl localhost:8080');
  T('curl après start', has(o, 'Welcome to nginx'), o);
  o = run(e, 'docker rm -f web');
  T('rm -f', o === 'web\n', o);
  o = run(e, 'docker rm web');
  T('rm : conteneur inconnu', o === 'Error response from daemon: No such container: web\n', o);
  o = run(e, 'docker stop web; docker logs web; docker exec web ls; docker inspect web; docker start web');
  T('commandes sur conteneur inconnu', has(o, 'Error response from daemon: No such container: web') && has(o, '[]\nError: No such object: web') && has(o, 'Error: failed to start containers: web'), o);
}

/* ---- erreurs de docker run ---- */
{
  const e = mkLab(); const { lab } = e;
  run(e, 'docker run -d --name aa -p 8080:80 nginx');
  let o = run(e, 'docker run -d --name bb -p 8080:80 nginx');
  T('port déjà alloué', /docker: Error response from daemon: driver failed programming external connectivity on endpoint bb \([0-9a-f]{64}\): Bind for 0\.0\.0\.0:8080 failed: port is already allocated\.\nSee 'docker run --help'\./.test(o), o);
  o = run(e, 'docker ps -a');
  T('conteneur resté en état Created', /Created +bb\n/.test(o) || /Created\s+bb/.test(o), o);
  o = run(e, 'docker run -d --name bb -p 8081:80 nginx');
  T('nom déjà utilisé après échec', has(o, 'Conflict. The container name "/bb" is already in use by container "') && has(o, 'to be able to reuse that name.') && !has(o, 'name..'), o);
  o = run(e, 'docker run -d --name cc -p 22:22 nginx');
  T('port 22 pris par l\'hôte', has(o, 'bind: address already in use'), o);
  o = run(e, 'docker run foo/inconnue');
  T('image introuvable', has(o, "pull access denied for foo/inconnue, repository does not exist or may require 'docker login': denied: requested access to the resource is denied"), o);
  o = run(e, 'docker run nginx:99');
  T('tag introuvable', has(o, 'manifest for nginx:99 not found: manifest unknown'), o);
  o = run(e, 'docker run');
  T('run sans argument', has(o, 'docker: "run" requires at least 1 argument.') && has(o, 'Usage:  docker run [OPTIONS] IMAGE [COMMAND] [ARG...]'), o);
  o = run(e, 'docker run --nope alpine');
  T('option inconnue', has(o, 'unknown flag: --nope'), o);
  o = run(e, 'docker foo');
  T('sous-commande inconnue', has(o, "docker: 'foo' is not a docker command."), o);
  o = run(e, 'docker run --rm alpine foo');
  T('exécutable introuvable', has(o, 'exec: "foo": executable file not found in $PATH: unknown.'), o);
  o = run(e, 'docker ps -a --format "{{.Names}}"');
  T('--rm : rien ne reste après échec', !/foo|nostalgic/.test(o) && o.split('\n').filter(Boolean).sort().join() === 'aa,bb,cc', o);
}

/* ---- shell, exec, -it ---- */
{
  const e = mkLab(); const { lab } = e;
  let o = run(e, ['docker run --rm alpine echo bonjour']);
  T('run alpine echo', /bonjour\n$/.test(o), o);
  o = run(e, ['docker run -it --name sh1 alpine', 'whoami', 'hostname', 'cat /etc/os-release', 'ls /', 'cd /tmp', 'pwd', 'echo salut > f.txt', 'cat f.txt', 'exit', 'whoami'], { echo: true });
  T('shell alpine : prompt et commandes', has(o, '/ # whoami\nroot') && has(o, 'PRETTY_NAME="Alpine Linux v3.20"') && has(o, '/tmp # pwd\n/tmp') && has(o, 'salut'), o);
  T('exit rend la main à l\'hôte', has(o, 'student@dockerlab:~$ ') && /exit\nstudent@dockerlab:~\$ whoami\nstudent/.test(o), o);
  o = run(e, 'docker ps -a');
  T('conteneur sorti après exit', /Exited \(0\)/.test(o), o);
  o = run(e, ['docker run -it --rm ubuntu', 'curl http://example.com', 'apt-get install -y curl', 'apt-get update', 'apt-get install -y curl', 'curl -s http://example.com | head -n 4', 'exit'], { echo: true });
  T('ubuntu : curl absent puis installé', has(o, 'bash: curl: command not found') && has(o, 'E: Unable to locate package curl') && has(o, 'Setting up curl') && has(o, '<title>Example Domain</title>'), o);
  o = run(e, ['docker run -d --name srv alpine sleep 3600', 'docker exec srv ps', 'docker exec srv sh -c "echo a; echo b"', 'docker exec srv env | grep HOME']);
  T('exec alpine', has(o, '1 root      0:00 sleep 3600') && has(o, 'a\nb\n') && has(o, 'HOME=/root'), o);
  o = run(e, 'docker exec srv bash');
  T('exec bash absent d\'alpine', has(o, 'OCI runtime exec failed: exec failed: unable to start container process: exec: "bash": executable file not found in $PATH: unknown'), o);
  o = run(e, 'docker exec nope ls');
  T('exec conteneur inconnu', has(o, 'Error response from daemon: No such container: nope'), o);
}

/* ---- stop : SIGTERM ignoré par sleep en PID 1 ---- */
{
  const e = mkLab(); const { lab } = e;
  run(e, 'docker run -d --name ss alpine sleep 3600');
  const t0 = lab.clock.now; run(e, 'docker stop ss', { gap: 0 }); const dt = lab.clock.now - t0;
  T('stop sleep : 10 s puis SIGKILL', dt >= 10000 && dt < 10500, String(dt));
  let o = run(e, 'docker ps -a');
  T('stop sleep : code 137', has(o, 'Exited (137)'), o);
  run(e, 'docker start ss'); const t1 = lab.clock.now; run(e, 'docker stop -t 2 ss', { gap: 0 });
  T('stop -t 2', lab.clock.now - t1 >= 2000 && lab.clock.now - t1 < 2500);
  run(e, 'docker start ss'); o = run(e, 'docker kill ss; docker ps -a');
  T('kill : immédiat 137', has(o, 'Exited (137)'), o);
}

/* ---- politique de redémarrage ---- */
{
  const e = mkLab(); const { lab } = e;
  run(e, 'docker run -d --name db --restart always postgres', { gap: 0 });
  lab.clock.runFor(3000);
  let o = run(e, 'docker ps -a', { gap: 0 });
  T('restart always : boucle de redémarrage', /Restarting \(1\)/.test(o) || /Up Less than a second|Up \d+ second/.test(o), o);
  const rc = lab.getContainer('db').state.restartCount;
  T('restart always : compteur', rc >= 3, String(rc));
  run(e, 'docker stop db');
  lab.clock.runFor(5000);
  o = run(e, 'docker ps -a', { gap: 0 });
  T('stop arrête la boucle', /Exited \(1\)/.test(o), o);
}

/* ---- volumes ---- */
{
  const e = mkLab(); const { lab } = e;
  let o = run(e, ['docker volume create data', 'docker run --rm -v data:/d alpine sh -c "echo bonjour > /d/a.txt"', 'docker run --rm -v data:/d alpine cat /d/a.txt', 'docker run --rm alpine cat /d/a.txt']);
  T('volume nommé persiste entre conteneurs', has(o, 'bonjour\n') && has(o, 'cat: can\'t open \'/d/a.txt\': No such file or directory'), o);
  o = run(e, 'docker volume rm data; docker volume ls -q');
  T('rm volume', o === 'data\n', o);
  run(e, ['mkdir site', 'echo "<h1>OK</h1>" > site/index.html', 'docker run -d --name w1 -p 8081:80 -v ~/site:/usr/share/nginx/html nginx']);
  o = run(e, 'curl localhost:8081');
  T('bind mount : sert le dossier hôte', o === '<h1>OK</h1>\n', o);
  run(e, 'echo v2 > site/index.html'); o = run(e, 'curl localhost:8081');
  T('bind mount : modification visible', o === 'v2\n', o);
  run(e, ['mkdir vide', 'docker run -d --name w2 -p 8082:80 -v ~/vide:/usr/share/nginx/html nginx']);
  o = run(e, 'curl -s localhost:8082');
  T('bind mount vide masque l\'image (403)', has(o, '403 Forbidden'), o);
  run(e, 'docker run -d --name w3 -p 8083:80 -v web:/usr/share/nginx/html nginx'); o = run(e, 'curl -s localhost:8083');
  T('volume nommé vide est initialisé par l\'image', has(o, 'Welcome to nginx'), o);
  o = run(e, 'docker volume rm web');
  T('volume utilisé : suppression refusée', /Error response from daemon: remove web: volume is in use - \[[0-9a-f]{64}\]/.test(o), o);
  o = run(e, 'docker inspect -f "{{range .Mounts}}{{.Type}}:{{.Destination}} {{end}}" w1 w3');
  T('inspect Mounts', has(o, 'bind:/usr/share/nginx/html') && has(o, 'volume:/usr/share/nginx/html'), o);
  o = run(e, ['docker volume create "x"']);
  T('nom de volume invalide', has(o, 'includes invalid characters for a local volume name'), o);
}

/* ---- données : postgres persiste dans un volume, redis aussi ---- */
{
  const e = mkLab(); const { lab } = e;
  let o = run(e, ['docker run -d --name pg -e POSTGRES_PASSWORD=x -v pgdata:/var/lib/postgresql/data postgres', 'docker exec pg ls /var/lib/postgresql/data']);
  T('postgres initialise PG_VERSION', has(o, 'PG_VERSION'), o);
  run(e, ['docker rm -f pg', 'docker run -d --name pg2 -e POSTGRES_PASSWORD=x -v pgdata:/var/lib/postgresql/data postgres']);
  o = run(e, 'docker logs pg2');
  T('postgres : base existante réutilisée', has(o, 'PostgreSQL Database directory appears to contain a database; Skipping initialization'), o);
  o = run(e, ['docker run -d --name rr -v rdata:/data redis', 'docker exec rr redis-cli set cle valeur', 'docker exec rr redis-cli get cle', 'docker stop rr', 'docker rm rr', 'docker run -d --name r2 -v rdata:/data redis', 'docker exec r2 redis-cli get cle']);
  T('redis : données rechargées depuis le volume', /OK\nvaleur\n/.test(o) && /valeur\n$/.test(o) && o.lastIndexOf('valeur') > o.indexOf('r\n'), o);
  o = run(e, ['docker run -d --name r3 redis', 'docker exec r3 redis-cli set a 1', 'docker rm -f r3', 'docker run -d --name r4 redis', 'docker exec r4 redis-cli get a']);
  T('redis sans volume : données perdues avec le conteneur', /OK\n/.test(o) && !/\n1\n/.test(o), o);
}

/* ---- réseaux ---- */
{
  const e = mkLab(); const { lab } = e;
  let o = run(e, ['docker network create mynet', 'docker network create mynet']);
  T('réseau en double', has(o, 'Error response from daemon: network with name mynet already exists'), o);
  run(e, ['docker run -d --name srv --network mynet nginx', 'docker run -d --name srv2 nginx']);
  o = run(e, 'docker run --rm --network mynet alpine wget -qO- http://srv');
  T('DNS entre conteneurs d\'un réseau utilisateur', has(o, 'Welcome to nginx'), o);
  o = run(e, 'docker run --rm alpine wget -qO- http://srv2');
  T('pas de DNS sur le bridge par défaut', has(o, "wget: bad address 'srv2'"), o);
  o = run(e, 'docker run --rm alpine wget -qO- http://172.17.0.2');
  T('IP directe sur le bridge par défaut', has(o, 'Welcome to nginx'), o);
  o = run(e, 'docker run --rm --network mynet alpine ping -c 1 172.17.0.2');
  T('réseaux isolés', has(o, '1 packets transmitted, 0 packets received, 100% packet loss'), o);
  o = run(e, ['docker network connect mynet srv2', 'docker run --rm --network mynet alpine ping -c 1 srv2']);
  T('connect : srv2 joignable par son nom', has(o, '1 packets transmitted, 1 packets received'), o);
  o = run(e, 'docker network rm mynet');
  T('réseau avec endpoints actifs', has(o, 'has active endpoints'), o);
  o = run(e, `docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}={{$v.IPAddress}} {{end}}' srv2`);
  T('inspect avec range et variables', /bridge=172\.17\.0\.\d+ mynet=172\.18\.0\.\d+/.test(o), o);
  o = run(e, ['docker network disconnect mynet srv2', 'docker network rm nope']);
  T('network rm inconnu', has(o, 'Error response from daemon: network nope not found'), o);
  o = run(e, 'docker run --rm --network none alpine ping -c 1 8.8.8.8');
  T('network none : pas d\'accès', has(o, '100% packet loss'), o);
  o = run(e, 'docker run --rm alpine ping -c 1 8.8.8.8');
  T('accès internet via NAT', has(o, '1 packets received') || has(o, '1 packets transmitted, 1 packets received'), o);
}

/* ---- images ---- */
{
  const e = mkLab(); const { lab } = e;
  run(e, ['docker pull alpine', 'docker pull alpine:3.19']);
  let o = run(e, 'docker images');
  T('images : tags multiples', /alpine\s+latest\s+[0-9a-f]{12}\s+\d+ weeks? ago\s+7\.8MB/.test(o) && /alpine\s+3\.19/.test(o), o);
  o = run(e, 'docker pull alpine');
  T('pull : déjà à jour', has(o, 'Status: Image is up to date for alpine:latest'), o);
  run(e, 'docker run --name keep alpine true');
  o = run(e, 'docker rmi alpine');
  T('rmi : image utilisée', /Error response from daemon: conflict: unable to remove repository reference "alpine:latest" \(must force\) - container [0-9a-f]{12} is using its referenced image [0-9a-f]{12}/.test(o), o);
  run(e, 'docker rm keep');
  o = run(e, 'docker rmi alpine');
  T('rmi : succès', has(o, 'Untagged: alpine:latest') && has(o, 'Deleted: sha256:'), o);
  o = run(e, 'docker rmi alpine:3.19 nope');
  T('rmi : inconnue', has(o, 'Error response from daemon: No such image: nope'), o);
  o = run(e, 'docker pull nginx:latest -q');
  T('pull -q', /^docker\.io\/library\/nginx:latest\n$/.test(o), o);
  o = run(e, ['docker tag nginx:latest monnginx:v1', 'docker images --format "{{.Repository}}:{{.Tag}}"']);
  T('tag + --format', has(o, 'monnginx:v1') && has(o, 'nginx:latest'), o);
}

/* ---- sous-shell, variables, pipes, substitution ---- */
{
  const e = mkLab(); const { lab } = e;
  run(e, ['docker run -d --name a1 alpine sleep 100', 'docker run -d --name a2 alpine sleep 100']);
  let o = run(e, 'docker ps -q | wc -l');
  T('pipe wc -l', o.trim() === '2', o);
  o = run(e, 'docker stop -t 0 $(docker ps -q) | wc -l');
  T('substitution $(…)', o.trim() === '2', o);
  o = run(e, 'docker ps -aq | head -n 1 | wc -c');
  T('head + wc -c', o.trim() === '13', o);
  o = run(e, ['X=42', 'echo $X ${X}x "$X y" \'$X\'']);
  T('variables', o === '42 42x 42 y $X\n', o);
  o = run(e, 'false || echo ok; true && echo ok2; false && echo no');
  T('||, &&, ;', o === 'ok\nok2\n', o);
  o = run(e, 'docker rm -f $(docker ps -aq)');
  T('rm -f $(ps -aq)', o.trim().split('\n').length === 2, o);
  o = run(e, 'docker ps -aq');
  T('rm -f : plus aucun conteneur', o.trim() === '', o);
  o = run(e, 'ls /etc; cd /etc; pwd; cat /etc/os-release | head -n 1; ls nope');
  T('commandes hôte', has(o, 'os-release') && has(o, '/etc\n') && has(o, 'PRETTY_NAME="Ubuntu 24.04.1 LTS"') && has(o, "ls: cannot access 'nope': No such file or directory"), o);
  o = run(e, 'mkdir /data');
  T('hôte : écriture interdite hors du home', has(o, "mkdir: cannot create directory '/data': Permission denied"), o);
}

console.log(bad ? ('ECHECS ' + bad + '/' + n) : ('docker : ' + n + ' vérifications OK'));
process.exit(bad ? 1 : 0);
