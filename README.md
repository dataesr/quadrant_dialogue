# Projet Quadrant

Application transitoire de visualisation par quadrants à bulles pour comparer
les performances d'établissements universitaires.

## Architecture

- `site-quadrant/` : application autonome
  - `api/` : API PHP 8.x (déploiement OVH)
  - `iframe/` : application React (Vite, dev local + déploiement OVH)
  - `tests/` : outils de test manuels
- `site-hote/` : composants pour intégration côté site hôte (PHP 5.6)
- `docs/` : cadrage, contrats d'interface, migrations SQL

## Démarrage

Voir `docs/INSTALL.md` pour la mise en place.

## Cadrage métier

Voir `docs/cadrage-quadrant.md` pour la spécification complète du projet.

## Brief pour Claude Code

Voir `CLAUDE.md` à la racine pour le contexte permanent du projet.
