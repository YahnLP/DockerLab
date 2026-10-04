# Docker Lab

Simulateur Docker **100 % navigateur** pour apprendre Docker sans rien installer : aucun serveur, aucun démon, aucune dépendance. Même esprit que le [Simulateur Réseau](https://github.com/YahnLP/simulateur-reseau) : une page statique hébergeable sur GitHub Pages.

Créé par Yahn LE PRETTRE - Formaxion Landes.

## Ce que l'on peut faire

- Un **terminal** réaliste (hôte Ubuntu simulé) : `docker run/ps/stop/start/restart/kill/rm/logs/exec/inspect/top/stats/cp/port/rename/pause`, `docker image|container|volume|network|system …`, formats Go (`--format`, `inspect -f`), confirmations de `prune`.
- Un **shell dans les conteneurs** (`-it`, `exec -it`) : commandes de base, pipes, redirections, `$(…)`, `apk`/`apt`, `curl`/`wget`/`ping`, `redis-cli`, `psql`.
- Une **vue graphique** : hôte, réseaux (bandes), conteneurs (cartes), ports publiés, volumes. Un clic sur une carte propose des actions (la vraie commande est tapée dans le terminal).
- Un **navigateur web** simulé pour tester les ports publiés, un **éditeur** (`nano`) pour l'hôte, un bouton **« 💡 Pourquoi ? »** qui explique la dernière commande.
- **18 TP intégrés** mêlant apports de cours, consignes commentées (« Pourquoi ? », « Vous devriez voir », décryptage des options) et récapitulatif, avec vérification automatique, correction et bouton « Recommencer » (menu *TP d'exemple*).
- **Docker Compose** simulé (`up`, `down`, `ps`, `logs`, `exec`, `run`, `build`, `config`…), avec projet, réseaux et volumes préfixés, `depends_on`, healthcheck, `--scale`.
- **Dockerfile et `docker build`** simulés : cache de couches, multi-étapes, `.dockerignore`, `ARG`, `docker history`, `docker commit`.
- Temps simulé (pause, vitesse, +1 min), sauvegarde automatique dans le navigateur, export/import JSON.

## Lancer

Ouvrir `index.html` (ou servir le dossier : `python3 -m http.server`). Pour un fichier unique autonome : `node tools/build.js` → `dist/docker-lab.html`.

**GitHub Pages** : Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`.

## Architecture

JavaScript « vanilla », espace de noms global `NS`, un fichier par responsabilité, chargés dans l'ordre de `index.html` (même ordre dans `tools/build.js`).

| Fichier | Rôle |
|---|---|
| `js/util.js`, `clock.js`, `vfs.js` | outils, horloge simulée à événements, système de fichiers virtuel |
| `js/registry.js` | catalogue d'images et comportements des services |
| `js/engine.js` | moteur : images, conteneurs, réseaux, volumes, ports, redémarrage |
| `js/minishell.js`, `procs.js` | shell et processus (hôte et conteneurs) |
| `js/dockercli.js`, `dockercli2.js` | commande `docker` |
| `js/state.js` | sauvegarde par **rejeu du journal** des commandes (moteur déterministe) |
| `js/build.js` | Dockerfile et `docker build` |
| `js/yaml.js`, `js/compose.js` | YAML (sous-ensemble) et `docker compose` |
| `js/scenarios.js` | infrastructure des TP, vérificateur, couverture, limites |
| `js/tp_base.js`, `js/tp_images.js`, `js/tp_compose.js` | les TP |
| `js/ui-core.js`, `term.js`, `view.js`, `panels.js`, `main.js` | interface |

## Tests (Node, sans navigateur)

```
node tests/t_docker.js   # moteur et CLI (83 vérifications)
node tests/t_state.js    # sauvegarde / restauration
node tests/t_build.js    # docker build (14 vérifications)
node tests/t_compose.js  # docker compose (29 vérifications)
node tests/t_sc.js       # rejoue les 18 TP : départ → correction → vérifications
```

## Limites connues

Voir l'onglet *Aide → Limites connues*. En résumé : aucun vrai programme n'est exécuté (services scriptés), catalogue de 13 images, pas encore de `docker build` ni de Compose (phases suivantes), quelques messages rares reconstitués de mémoire.
