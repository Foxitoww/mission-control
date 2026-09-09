# Contribuer à MISSION CONTROL

## Branches

```
Dev   ← toute la construction se fait ici
 │
 └── pull request ──▶ main   ← stable, protégée, seule source des releases
```

- **`Dev`** est la branche de travail. Les commits y vont directement.
- **`main`** ne reçoit rien d'autre qu'une pull request depuis `Dev`, une fois la CI
  au vert. Elle représente ce qui est réputé fonctionner.

`main` est protégée sur GitHub : ni force-push, ni suppression, et la CI
(typecheck + tests) doit passer avant toute fusion. Le propriétaire du dépôt
peut contourner en cas d'urgence, mais ce n'est pas le chemin normal.

## Publier une version

Les releases partent **de `main`**, jamais de `Dev` :

```bash
git checkout main
git merge --ff-only Dev
npm version minor
git push origin main --follow-tags
```

Le tag `v*` déclenche le workflow `release`, qui construit le `setup.exe` et le
publie avec son `latest.yml`. Les applications déjà installées découvrent la
nouvelle version par ce fichier (voir ADR-006).

## Avant d'ouvrir une pull request

```bash
npm run typecheck
```

```bash
npm test
```

Une fonctionnalité n'est pas terminée parce qu'elle compile — voir la définition de
« terminé » dans [docs/AGENTS.md](docs/AGENTS.md).
