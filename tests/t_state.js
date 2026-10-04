const { NS, Lab, mkLab, run } = require('./helpers');
let bad = 0; const T = (n, ok, d) => { if (!ok) { bad++; console.log('FAIL ' + n + (d ? '\n' + d : '')); } };
const e = mkLab(7); const { lab } = e;
run(e, ['docker network create net1', 'docker volume create v1', 'docker run -d --name web --network net1 -p 8080:80 -v v1:/usr/share/nginx/html nginx',
  'docker run -it --name sh1 --network net1 alpine', 'echo salut > /tmp/a', 'wget -qO- http://web', 'exit', 'echo hello > note.txt', 'docker ps -a'], { echo: false });
const o1 = run(e, ['docker ps -a', 'docker exec sh1 cat /tmp/a', 'docker logs web', 'cat note.txt']);
const snap = JSON.parse(JSON.stringify(NS.snapshotLab(lab)));
const lab2 = NS.restoreLab(snap);
const e2 = { lab: lab2, s: lab2.sessions[0] };
const o2 = run(e2, ['docker ps -a', 'docker exec sh1 cat /tmp/a', 'docker logs web', 'cat note.txt']);
const nz = s => s.replace(/\d+ (seconds?|minutes?)/g, 'N $1').replace(/ +/g,' '); T('restauration identique', nz(o1) === nz(o2), o1 + '\n---\n' + o2);
T('journal conservé', lab2.journal.length >= snap.journal.length);
console.log(bad ? 'ECHECS ' + bad : 'state : OK');
