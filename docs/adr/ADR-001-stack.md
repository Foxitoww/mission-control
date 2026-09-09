# ADR-001 — Electron plutôt que Tauri

**Problème.** Aucun runtime n'est installé sur la machine. Toute stack impose une
installation, et le coût d'installation devient un critère de décision réel.

**Décision.** Electron + React + TypeScript + better-sqlite3.

**Raison.** Tauri produit le meilleur artefact final (binaire ~10 MB contre ~150 MB,
empreinte mémoire réduite, isolation supérieure), mais exige deux chaînes d'outils —
Node **et** Rust **et** les MSVC Build Tools (2–6 GB, échec d'installation fréquent
sur Windows vierge). Selon l'ordre de priorité du cahier des charges (§42), la
*fiabilité* et la *simplicité* passent avant la *performance*. Electron demande une
seule installation et `better-sqlite3` fournit un vrai SQLite natif, synchrone et
très rapide.

**Impact.** Application plus lourde et plus gourmande en RAM. Mitigation : la couche
données est isolée derrière `ipc-contract.ts`, donc un portage Tauri ultérieur
remplacerait `main/` sans toucher `renderer/` ni `shared/`.
