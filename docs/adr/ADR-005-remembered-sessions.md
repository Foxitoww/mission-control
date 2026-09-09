# ADR-005 — Sessions mémorisées (« se souvenir de moi »)

**Problème.** ADR implicite de la Phase 2 : la session vivait uniquement en
mémoire du processus main, donc fermer l'application déconnectait. Le raisonnement
était qu'une session persistée, sur un poste partagé, ouvrirait l'application sur
le compte du précédent utilisateur. L'usage quotidien a tranché autrement : ressaisir
un mot de passe à chaque lancement d'une application locale est une friction
disproportionnée.

**Décision.** Persistance **optionnelle**, décochée par défaut, valable 30 jours.

- Un jeton aléatoire de 256 bits est écrit dans `userData/session.json`.
- La base ne stocke que son empreinte **SHA-256**, dans `remembered_sessions`.
- Le jeton est **remplacé à chaque restauration** réussie.
- Se déconnecter, se reconnecter sans cocher la case, ou supprimer le compte
  révoque la session.

**Raison.**

*Pourquoi SHA-256 et non scrypt.* scrypt est délibérément lent parce qu'un mot de
passe humain a peu d'entropie et doit résister à un dictionnaire. Un jeton tiré au
hasard sur 256 bits n'a pas ce problème : il n'existe aucun dictionnaire à parcourir.
Un hachage rapide suffit et évite d'imposer 100 ms à chaque démarrage.

*Pourquoi deux fichiers.* Le jeton et son empreinte vivent séparément — l'un dans
`session.json`, l'autre dans la base. Supprimer l'un OU l'autre révoque la session,
ce qui donne deux moyens simples de reprendre la main.

*Pourquoi la rotation.* Une copie de `session.json` prise hier ne vaut plus rien dès
que l'application a redémarré une fois. Cela borne la fenêtre d'exploitation d'un
fichier exfiltré, sans rien coûter à l'utilisateur légitime.

*Sur le modèle de menace.* Quiconque peut lire `session.json` peut aussi lire
`mission-control.db`, donc déjà toutes les données. La persistance n'affaiblit pas
la défense contre un accès au système de fichiers — elle affaiblit uniquement la
défense contre une **autre personne utilisant la même session Windows**. D'où le
choix par défaut à FALSE et la mention explicite du poste partagé dans l'interface.

**Impact.** Une table et un fichier de plus. La restauration a lieu avant la
création de la fenêtre, pour que le renderer trouve un état définitif à son premier
rendu. Quatorze tests couvrent l'émission, la restauration, la rotation, la
falsification, l'expiration et la révocation.
