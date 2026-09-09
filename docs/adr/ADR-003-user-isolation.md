# ADR-003 — Le renderer ne transmet jamais d'identifiant utilisateur

**Problème.** Plusieurs utilisateurs locaux partagent un unique fichier SQLite. Un
utilisateur ne doit jamais pouvoir atteindre les données d'un autre (§5, §33).

**Décision.** L'identifiant de l'utilisateur connecté est détenu **uniquement** par
`SessionService`, en mémoire du processus main. Aucun canal IPC n'accepte de `userId`
en paramètre. Chaque handler appelle `session.requireUserId()` et injecte la valeur
dans le repository. Toute requête sur une table possédée porte `WHERE user_id = ?`.

**Raison.** Si le renderer fournissait l'identifiant, toute faille d'interface — bug,
injection dans un champ, extension malveillante — deviendrait une fuite entre comptes.
En retirant purement le paramètre du contrat, l'attaque n'a plus de surface : il n'y a
rien à falsifier.

**Impact.** Les handlers IPC ne peuvent pas agir pour le compte d'un autre utilisateur,
ce qui est exactement l'objectif. Un test de régression dédié crée deux utilisateurs
avec des données homonymes et vérifie l'étanchéité dans les deux sens. Ce test est
bloquant pour la sortie de Phase 2.
