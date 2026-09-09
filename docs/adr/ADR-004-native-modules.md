# ADR-004 — Node-API, et alignement du niveau d'API avec le runtime

**Problème.** Deux échecs successifs, de même famille.

1. `better-sqlite3` v11 ne publie pas de binaire précompilé pour Node 24 : npm a
   basculé sur une compilation depuis les sources, qui exige les MSVC Build Tools
   (2–6 Go), absents de la machine. C'était exactement le risque invoqué en
   ADR-001 pour écarter Tauri, revenu par une autre porte.
2. Passé en v13 (Node-API), le binaire s'installait sans compilation mais faisait
   **planter silencieusement** le processus main d'Electron 33 — aucune trace,
   sortie en code 3.

**Décision.** `better-sqlite3` ^13 (Node-API) **et** Electron ^44, en supprimant
l'étape `electron-builder install-app-deps` du `postinstall`.

**Raison.** Un module natif compilé contre l'ABI V8 doit être reconstruit pour
chaque version de Node et d'Electron — d'où les outils de compilation, d'où
`electron-rebuild`. Node-API est une frontière C stable : le paquet livre **un
seul** binaire par plateforme (`prebuilds/win32-x64.node`), sans numéro d'ABI.

Mais cette stabilité est **ascendante seulement**. Un binaire qui cible Node-API 10
ne se charge pas sur un runtime qui n'expose que Node-API 9 — et l'échec est
muet, car il survient au chargement de la bibliothèque dynamique, avant tout
gestionnaire d'erreur JavaScript.

| Runtime | Node | Node-API |
|---|---|---|
| Node hôte | 24.19 | 10 |
| Electron 33 | 20.18 | **9** ← incompatible |
| Electron 44 | 24.20 | **10** ← retenu |

`better-sqlite3` v13 déclare `engines: node >= 22` : cette ligne était l'indice,
et elle vaut pour le runtime d'**Electron**, pas seulement pour le Node hôte.

**Impact.** Toute la classe d'échecs « il faut Visual Studio » disparaît, y compris
pour un futur contributeur sur une machine vierge. Deux règles à tenir :

- toute dépendance native ajoutée ensuite doit être Node-API — le vérifier revient
  à chercher un dossier `prebuilds/` nommé par plateforme, sans numéro d'ABI ;
- avant de figer une version d'Electron, comparer `process.versions.napi` du
  runtime Electron au niveau exigé par les modules natifs. Le champ `engines` du
  paquet est la source à lire.

**Note d'environnement.** npm bloque les scripts d'installation sur cette machine
(`allow-scripts`), ce qui empêche Electron de télécharger son binaire à
l'installation. Après un `npm install` sur un poste neuf, exécuter :

```bash
node node_modules/electron/install.js
```
