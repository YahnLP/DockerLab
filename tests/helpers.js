const NS = require('./load')();
const { Lab, HostSession } = NS;
/* crée un laboratoire déterministe + une session de terminal */
function mkLab(seed) { const lab = new Lab({ epoch: Date.UTC(2026, 9, 4, 7, 38, 0), seed: seed || 1 }); const s = new HostSession(lab); return { lab, s }; }
/* exécute des lignes dans la session ; renvoie la sortie concaténée. Fait avancer l'horloge jusqu'à la fin de chaque commande. */
function run(env, lines, opts) {
  opts = opts || {}; const { lab, s } = env; let out = '';
  const arr = Array.isArray(lines) ? lines : lines.split('\n');
  for (const l of arr) {
    let done = false; const io = { print: t => { out += t; }, done: () => { done = true; }, clear() { } };
    if (opts.echo) out += s.prompt() + l + '\n';
    s.exec(l.replace(/^\s+/, ''), io);
    if (!done) lab.clock.runUntil(() => done, opts.max || 120000);
    if (!done) { s.abort(); out += '\n[TIMEOUT sur: ' + l + ']\n'; lab.clock.runFor(1000); }
    lab.clock.runFor(opts.gap === undefined ? 1500 : opts.gap); /* délai de frappe de l'utilisateur */
  }
  return out;
}
module.exports = { NS, Lab, mkLab, run };
