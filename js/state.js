/* state.js — sauvegarde / restauration par rejeu du journal des commandes.
   Le moteur est déterministe (horloge simulée + graine) : on enregistre la graine, l'époque et chaque
   ligne saisie avec son instant simulé ; restaurer = rejouer le tout, sans rien afficher. */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};

/* enregistre une écriture de fichier hôte faite par l'éditeur de l'interface (nano) */
NS.recordHostWrite = function (lab, path, data) { if (lab.replaying) return; lab.journal.push({ f: path, d: data, t: lab.clock.now, s: -1 }); };

NS.snapshotLab = function (lab, extra) {
  return Object.assign({ app: 'docker-lab', v: 1, epoch: lab.epoch, seed: lab.seed, now: lab.clock.now, journal: lab.journal.slice() }, extra || {});
};

/* reconstruit un laboratoire identique ; `setup(lab)` (facultatif) est appelé avant le rejeu (TP : état de départ) */
NS.restoreLab = function (data, setup) {
  if (!data || data.app !== 'docker-lab' || !Array.isArray(data.journal)) throw new Error('fichier Docker Lab invalide');
  const lab = new NS.Lab({ epoch: data.epoch, seed: data.seed });
  lab.replaying = true;
  try {
    if (setup) setup(lab);
    const nop = { print() { }, clear() { }, done() { } };
    for (const e of data.journal) {
      if (e.t > lab.clock.now) lab.clock.runFor(e.t - lab.clock.now);
      if (e.f) { lab.hostFs.writep(e.f, e.d); continue; }
      while (lab.sessions.length <= e.s) new NS.HostSession(lab);
      const s = lab.sessions[e.s];
      if (e.a) s.abort(); else s.exec(e.l, nop);
    }
    if (data.now > lab.clock.now) lab.clock.runFor(data.now - lab.clock.now);
  } finally { lab.replaying = false; }
  lab.journal = data.journal.slice();
  return lab;
};
})(typeof window !== 'undefined' ? window : globalThis);
