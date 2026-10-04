/* rejoue chaque TP : état de départ → vérifications (avant) → correction → vérifications (après) */
const { NS, Lab } = require('./helpers');
let bad = 0;
for (const sc of NS.SCENARIOS) {
  const lab = new Lab({ epoch: Date.UTC(2026, 9, 4, 7, 38, 0), seed: 3 }); sc.build(lab); lab.clock.runFor(2000);
  const c0 = NS.checker(lab); const before = sc.checks.map(k => { try { return !!k.run(c0); } catch (e) { return 'ERR ' + e.message; } });
  sc.solve(lab, null); lab.clock.runFor(3000);
  const c = NS.checker(lab); const after = sc.checks.map(k => { try { return !!k.run(c); } catch (e) { return 'ERR ' + e.stack.split('\n').slice(0, 3).join('|'); } });
  const ok = after.every(x => x === true); const trivial = before.every(x => x === true); if (!ok || trivial) bad++;
  console.log((ok && !trivial ? 'PASS ' : 'FAIL ') + sc.id + '  avant=' + before.map(x => x === true ? 1 : x === false ? 0 : x).join('') + ' après=' + after.map(x => x === true ? 1 : x === false ? 0 : x).join(''));
}
console.log(bad ? 'ECHECS ' + bad : 'tous les TP OK (' + NS.SCENARIOS.length + ')');
