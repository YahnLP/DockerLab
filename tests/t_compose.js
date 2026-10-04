// Tests de docker compose : YAML, projet, up/down/ps/logs, dépendances, erreurs, build, réseaux
const { NS, mkLab, run } = require('./helpers');
let bad = 0, n = 0;
function T(name, cond, info) { n++; if (!cond) { bad++; console.log('FAIL ' + name + (info ? '\n' + info : '')); } }
const has = (s, x) => s.includes(x);
const mk = (files) => { const e = mkLab(2); Object.keys(files).forEach(p => e.lab.hostFs.writep('/home/student/' + p, files[p])); return e; };

/* YAML */
{
  const y = NS.yaml.parse('a:\n  - x: 1\n    y: "d: e"\n  - [1, 2]\nb: |\n  l1\n  l2\nc: {k: v}\n# fin\n');
  T('yaml : liste de maps, flux, bloc', y.a[0].x === 1 && y.a[0].y === 'd: e' && y.a[1][1] === 2 && y.b === 'l1\nl2\n' && y.c.k === 'v', JSON.stringify(y));
  let m = ''; try { NS.yaml.parse('a: 1\n\tb: 2\n'); } catch (e) { m = e.message; }
  T('yaml : tabulation refusée', has(m, 'line 2') && has(m, 'cannot start any token'), m);
}
/* projet complet */
{
  const e = mk({ 'shop/compose.yaml': 'services:\n  web:\n    image: nginx\n    ports: ["8080:80"]\n    depends_on:\n      db:\n        condition: service_healthy\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: x\n    volumes: ["data:/var/lib/postgresql/data"]\n    healthcheck:\n      test: ["CMD-SHELL", "pg_isready -U postgres"]\n      interval: 5s\nvolumes:\n  data:\n' });
  let o = run(e, ['cd shop', 'docker compose up -d'], { max: 400000 });
  T('up : réseau, volume, conteneurs', has(o, 'Network shop_default') && has(o, 'Volume shop_data') && has(o, 'Container shop-db-1   Healthy') && has(o, 'Container shop-web-1  Started'), o);
  o = run(e, 'docker compose ps');
  T('ps : colonnes et santé', /NAME +IMAGE +COMMAND +SERVICE +CREATED +STATUS +PORTS/.test(o) && has(o, '(healthy)') && has(o, '0.0.0.0:8080->80/tcp'), o);
  T('noms et réseau DNS', e.lab.getContainer('shop-web-1') && e.lab.canReach(e.lab.getContainer('shop-web-1'), e.lab.getContainer('shop-db-1')));
  T('curl via port publié', has(run(e, 'curl localhost:8080'), 'Welcome to nginx'));
  o = run(e, 'docker compose logs db');
  T('logs préfixés', /^shop-db-1 {2}\| /m.test(o), o);
  o = run(e, 'docker compose up -d');
  T('up idempotent : Running', has(o, 'Running') && !has(o, 'Started') , o);
  o = run(e, ['docker compose stop', 'docker compose ps -a']);
  T('stop puis ps -a : Exited', has(o, 'Stopped') && has(o, 'Exited'), o);
  o = run(e, ['docker compose down', 'docker ps -a', 'docker volume ls', 'docker network ls'], { max: 400000 });
  T('down : conteneurs et réseau supprimés, volume conservé', has(o, 'Network shop_default  Removed') && has(o, 'shop_data') && !has(o, 'shop_default   '), o);
  o = run(e, ['docker compose up -d', 'docker compose down -v'], { max: 400000 });
  T('down -v : volume supprimé', /Volume shop_data +Removed/.test(o), o);
  o = run(e, 'docker compose config');
  T('config : valeurs explicites', has(o, 'name: shop') && has(o, 'published: "8080"') && has(o, 'name: shop_default'), o);
}
/* erreurs */
{
  const e = mk({ 'a/compose.yaml': 'services:\n  w:\n    imagee: nginx\n', 'b/compose.yaml': 'services:\n  w:\n    image: nginx\n    volumes: ["v:/x"]\n', 'c/compose.yaml': 'services:\n  a:\n    image: nginx\n    depends_on: [b]\n  b:\n    image: nginx\n    depends_on: [a]\n', 'd/compose.yaml': 'services:\n  w:\n    ports: ["80:80"]\n', 'e/compose.yaml': 'services:\n  w:\n    image: nginx\n   bad: 1\n' });
  T('sans fichier', has(run(e, 'docker compose up'), 'no configuration file provided: not found'));
  T('propriété inconnue', has(run(e, ['cd a', 'docker compose config']), 'services.w Additional property imagee is not allowed'));
  T('volume non déclaré', has(run(e, ['cd ../b', 'docker compose config']), 'service "w" refers to undefined volume v: invalid compose project'));
  T('cycle', has(run(e, ['cd ../c', 'docker compose config']), 'dependency cycle detected: a -> b -> a'));
  T('ni image ni build', has(run(e, ['cd ../d', 'docker compose config']), 'service "w" has neither an image nor a build context specified: invalid compose project'));
  T('YAML invalide', has(run(e, ['cd ../e', 'docker compose config']), 'yaml: line 4'));
}
/* variables, .env, build, scale, run, exec, réseaux */
{
  const e = mk({ 'p/.env': 'TAG=alpine\n', 'p/web/Dockerfile': 'FROM nginx:alpine\nCOPY i.html /usr/share/nginx/html/index.html\n', 'p/web/i.html': 'V1\n', 'p/compose.yaml': 'services:\n  web:\n    build: ./web\n    ports: ["8090:80"]\n  c:\n    image: nginx:${TAG}\n    environment:\n      X: ${MISSING}\n      Y: ${Y:-def}\n  front:\n    image: alpine\n    command: sleep 300\n    networks: [f]\n  back:\n    image: alpine\n    command: sleep 300\n    networks: [b]\n  api:\n    image: nginx\n    networks: [f, b]\nnetworks:\n  f:\n  b:\n' });
  let o = run(e, ['cd p', 'docker compose up -d'], { max: 400000 });
  T('variable absente : avertissement', has(o, 'WARN[0000] The "MISSING" variable is not set. Defaulting to a blank string.'), o);
  T('build via Compose', e.lab.findImage('p-web') && has(run(e, 'curl localhost:8090'), 'V1'), o);
  T('.env interpolé, défaut ${Y:-def}', e.lab.getContainer('p-c-1').imageRef === 'nginx:alpine' && e.lab.getContainer('p-c-1').envMap().Y === 'def');
  T('réseaux : front/back isolés', !e.lab.canReach(e.lab.getContainer('p-front-1'), e.lab.getContainer('p-back-1')) && e.lab.canReach(e.lab.getContainer('p-front-1'), e.lab.getContainer('p-api-1')));
  o = run(e, 'docker compose exec front ping -c 1 back');
  T('ping : nom non résolu', has(o, 'bad address'), o);
  run(e, 'echo V2 > web/i.html');
  o = run(e, 'docker compose up -d'); T('sans --build : pas de reconstruction', has(o, 'Running') && has(run(e, 'curl localhost:8090'), 'V1'), o);
  run(e, 'docker compose up -d --build'); T('--build : reconstruit et recrée', has(run(e, 'curl localhost:8090'), 'V2'));
  o = run(e, 'docker compose run --rm front echo salut'); T('run --rm', has(o, 'salut') && !e.lab.containers.some(c => /-run-/.test(c.name)), o);
  o = run(e, 'docker compose up -d --scale api=2');
  T('scale : 2e instance', !!e.lab.getContainer('p-api-2'), o);
  o = run(e, 'docker compose ls'); T('ls', has(o, 'running(') && has(o, '/home/student/p/compose.yaml'), o);
}
/* un échec de port n'empêche pas les services indépendants */
{
  const e = mk({ 'q/compose.yaml': 'services:\n  w:\n    image: nginx\n    ports: ["8080:80"]\n  d:\n    image: redis\n' });
  run(e, 'docker run -d --name occupe -p 8080:80 nginx'); const o = run(e, ['cd q', 'docker compose up -d']);
  T('port pris : erreur, mais l\'autre service démarre', has(o, 'port is already allocated') && e.lab.getContainer('q-d-1').running && e.lab.getContainer('q-w-1').state.status === 'created', o);
}
console.log(bad ? 'ECHECS ' + bad + '/' + n : 'compose : ' + n + ' vérifications OK'); process.exit(bad ? 1 : 0);
