# ADR-002 — scrypt (node:crypto) plutôt qu'argon2 natif

**Problème.** Les mots de passe ne doivent jamais être stockés en clair (§34). Argon2id
est la recommandation par défaut de l'industrie, mais chaque module natif ajouté doit
être recompilé contre l'ABI d'Electron — une source classique d'échec de build.

**Décision.** `scrypt` via `node:crypto`, paramètres `N=2^15, r=8, p=1`, sel aléatoire
de 32 octets, format stocké `scrypt$N$r$p$salt$hash`, comparaison en temps constant
via `timingSafeEqual`.

**Raison.** `better-sqlite3` est déjà un module natif à recompiler ; en ajouter un
second double le risque de build. scrypt est une KDF *memory-hard*, présente dans le
cœur de Node, sans aucune dépendance, et reste recommandée par l'OWASP pour le
stockage de mots de passe. Le modèle de menace est local : pas de serveur exposé,
pas d'attaque distante en ligne.

**Impact.** Argon2id resterait marginalement plus résistant au cracking GPU. Le format
de hachage est **auto-descriptif** (préfixe `scrypt$` + paramètres) : une migration
vers argon2id pourra ré-encoder à la volée à la prochaine connexion réussie, sans
réinitialisation de mot de passe.
