/* clock.js — horloge simulée à événements discrets (même principe que sim.js du simulateur réseau) */
(function (g) {
'use strict';
const NS = g.NS = g.NS || {};

NS.Clock = class Clock {
  constructor() { this.now = 0; this.q = []; this.seq = 0; }
  /* planifie fn dans `ms` millisecondes simulées ; renvoie un identifiant annulable */
  schedule(ms, fn) { const ev = { t: this.now + Math.max(0, ms), id: ++this.seq, fn, dead: false }; let i = this.q.length; while (i > 0 && (this.q[i - 1].t > ev.t)) i--; this.q.splice(i, 0, ev); return ev; }
  cancel(ev) { if (ev) ev.dead = true; }
  /* exécute les événements échus jusqu'à now+ms */
  runFor(ms) {
    const end = this.now + ms;
    for (;;) {
      while (this.q.length && this.q[0].dead) this.q.shift();
      if (!this.q.length || this.q[0].t > end) break;
      const ev = this.q.shift(); this.now = Math.max(this.now, ev.t);
      try { ev.fn(); } catch (e) { if (this.onError) this.onError(e); else throw e; }
    }
    this.now = Math.max(this.now, end);
  }
  /* avance jusqu'à ce que pred() soit vrai (ou max ms simulées écoulées) */
  runUntil(pred, max) {
    const end = this.now + (max || 60000);
    while (!pred()) {
      while (this.q.length && this.q[0].dead) this.q.shift();
      if (!this.q.length || this.q[0].t > end) { this.now = Math.min(Math.max(this.now, end), end); return pred(); }
      const ev = this.q.shift(); this.now = Math.max(this.now, ev.t);
      try { ev.fn(); } catch (e) { if (this.onError) this.onError(e); else throw e; }
    }
    return true;
  }
  pending() { return this.q.filter(e => !e.dead).length; }
};
})(typeof window !== 'undefined' ? window : globalThis);
