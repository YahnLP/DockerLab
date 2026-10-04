// Tests de docker build : Dockerfile, cache, multi-étapes, erreurs, history, commit
const { NS, mkLab, run } = require('./helpers');
let bad = 0, n = 0;
function T(name, cond, info) { n++; if (!cond) { bad++; console.log('FAIL ' + name + (info ? '\n' + info : '')); } }
const has = (s, x) => s.includes(x);
const pf = (s) => "printf '" + s.replace(/\n/g, '\\n') + "' > ";

{ /* mono-étape + cache + run */
  const e = mkLab(2); const { lab } = e;
  run(e, ['mkdir -p ~/app && cd ~/app', 'echo "<h1>Bonjour</h1>" > index.html', pf('FROM nginx\nCOPY index.html /usr/share/nginx/html/\nEXPOSE 80\n') + 'Dockerfile']);
  let o = run(e, 'docker build -t monsite:1.0 .');
  T('build : étapes et nommage', has(o, 'COPY index.html /usr/share/nginx/html/') && has(o, 'naming to docker.io/library/monsite:1.0'), o);
  T('build : image créée', !!lab.findImage('monsite:1.0'));
  const id1 = lab.findImage('monsite:1.0').id;
  o = run(e, 'docker build -t monsite:1.1 .');
  T('rebuild : CACHED et même ID', has(o, 'CACHED') && lab.findImage('monsite:1.1').id === id1, o);
  run(e, 'echo "<h1>V2</h1>" > index.html');
  run(e, 'docker build -t monsite:2 .');
  T('fichier modifié : nouvel ID', lab.findImage('monsite:2').id !== id1);
  run(e, 'docker run -d --name site -p 8080:80 monsite:2');
  T('run : sert la page copiée', has(run(e, 'curl localhost:8080'), 'V2'));
  o = run(e, 'docker history monsite:2');
  T('history : instruction COPY', has(o, 'COPY index.html') && has(o, 'IMAGE'), o);
  o = run(e, 'docker build --no-cache -q -t q:1 .');
  T('-q : affiche seulement sha256', /^sha256:[0-9a-f]{64}\n$/.test(o), o);
}
{ /* erreurs */
  const e = mkLab(2);
  let o = run(e, ['mkdir ~/x && cd ~/x', 'docker build .']);
  T('sans Dockerfile : erreur', has(o, 'Dockerfile') && has(o, 'no such file'), o);
  run(e, pf('FROM alpine\nRUN exit 3\n') + 'Dockerfile');
  o = run(e, 'docker build -t bad .');
  T('RUN en échec : code de sortie', has(o, 'exit code: 3') && has(o, 'Dockerfile:2'), o);
  T('RUN en échec : pas d\'image', !e.lab.findImage('bad'));
  run(e, pf('FROM alpine\nCOPY absent.txt /\n') + 'Dockerfile');
  o = run(e, 'docker build -t bad2 .');
  T('COPY fichier absent', has(o, 'absent.txt') && has(o, 'not found'), o);
}
{ /* ARG, ENV, multi-étapes, commit */
  const e = mkLab(2); const { lab } = e;
  run(e, ['mkdir ~/m && cd ~/m', 'echo hello > a.txt', pf('FROM alpine AS b\nARG V=1\nRUN echo ${V} > /v.txt\nCOPY a.txt /a.txt\nFROM busybox\nCOPY --from=b /v.txt /v.txt\nENV X=y\nCMD ["cat","/v.txt"]\n') + 'Dockerfile']);
  run(e, 'docker build --build-arg V=7 -t multi .');
  T('multi-étapes + ARG', lab.findImage('multi') && new NS.VFS(lab.findImage('multi').fs).read('/v.txt') === '7\n' && !new NS.VFS(lab.findImage('multi').fs).read('/a.txt'));
  T('CMD exécuté au run', has(run(e, 'docker run --rm multi'), '7'));
  run(e, ['docker run -d --name cc alpine sleep 100', 'docker exec cc sh -c "echo hi > /f.txt"', 'docker commit cc snap:1']);
  T('commit : fichier dans la nouvelle image', !!lab.findImage('snap:1') && /hi/.test(new NS.VFS(lab.findImage('snap:1').fs).read('/f.txt') || ''));
}
console.log(bad ? 'ECHECS ' + bad + '/' + n : 'build : ' + n + ' vérifications OK'); process.exit(bad ? 1 : 0);
