# ADR-006 — Mises à jour par releases GitHub

**Problème.** Distribuer les correctifs sans demander à l'utilisateur d'aller
chercher un nouvel installeur, tout en restant fidèle au principe local-first.

**Décision.** `electron-updater` avec le fournisseur GitHub, alimenté par un
workflow déclenché sur les tags `v*`. L'installeur est un NSIS `setup.exe`.

**Raison.** « Lié à git » ne peut pas signifier `git pull` : une application
empaquetée n'embarque ni dépôt, ni git. Le lien réel passe par les **tags** :

```
git tag v0.2.0 → CI → setup.exe + latest.yml publiés dans la release
                    → l'application compare sa version à latest.yml
                    → téléchargement, puis installation au redémarrage
```

Le téléchargement est automatique, **l'installation ne l'est pas** : rien ne
redémarre pendant que l'utilisateur travaille. Le paquet est préparé, et il choisit
le moment.

Cela ne contredit pas le principe local-first : les *données* ne quittent jamais la
machine. Seule la vérification de version émet une requête, différée de 8 secondes
après le lancement pour ne pas disputer la bande passante au premier rendu.

**Impact.**

- La construction locale de l'installeur se heurte à une limite Windows :
  electron-builder extrait `winCodeSign`, qui contient deux liens symboliques macOS,
  et créer un lien symbolique exige un privilège que le compte n'a pas (Developer
  Mode désactivé). Contourné en pré-remplissant le cache
  `…/electron-builder/Cache/winCodeSign/winCodeSign-2.6.0` sans le dossier `darwin`.
  **La CI GitHub n'a pas ce problème** — c'est le chemin de publication recommandé.
- L'installeur n'est **pas signé**. Windows SmartScreen affichera un avertissement
  à la première exécution. Le signer demanderait un certificat de signature de code
  payant ; à décider si l'application est distribuée au-delà d'un usage personnel.
- En développement, `app.isPackaged` est faux : le service répond `unsupported`
  plutôt qu'une erreur, et l'interface le dit calmement.
