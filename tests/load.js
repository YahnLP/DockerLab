// charge les fichiers du moteur dans un contexte node (sans DOM)
const fs = require('fs'), vm = require('vm'), path = require('path');
module.exports = function (files) {
  const root = path.join(__dirname, '..', 'js');
  const ctx = globalThis; ctx.window = undefined;
  (files || ['util', 'clock', 'vfs', 'registry', 'engine', 'minishell', 'procs', 'dockercli', 'dockercli2', 'state', 'scenarios']).forEach(f => {
    const p = path.join(root, f + '.js'); if (!fs.existsSync(p)) return;
    vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: p });
  });
  return globalThis.NS;
};
