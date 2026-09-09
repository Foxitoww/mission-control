# ADR-007 — Chiffrement des données au repos

**Problème.** Les mots de passe étaient hachés et l'isolation entre comptes prouvée
par tests, mais le fichier `mission-control.db` restait **en clair sur le disque**.
Quiconque y accédait — disque volé, fichier copié, autre utilisateur du poste,
sauvegarde cloud — lisait toutes les tâches sans avoir besoin d'un mot de passe.

**Décision.** Chiffrement **enveloppe**, en deux couches, avec une base par compte.

```
accounts.db (en clair)                vaults/<userId>.mcv (chiffré)
├─ identité visible                   └─ projets, tâches, sous-tâches,
├─ empreinte du mot de passe             tags, objectifs, paramètres
└─ clé de données ENVELOPPÉE
   ├─ par le mot de passe   (toujours)
   ├─ par la phrase de récupération (toujours)
   └─ par le système / DPAPI (si « se souvenir de moi »)
```

- **DEK** — clé aléatoire de 256 bits, tirée à la création du compte, qui ne
  change jamais. C'est elle qui chiffre le coffre, en AES-256-GCM.
- Le coffre est une base SQLite `serialize()` puis scellée. Le fichier n'est
  jamais un fichier SQLite : aucun outil ne peut l'ouvrir.
- Ce qui est stocké dans `accounts.db`, ce sont trois **enveloppes** de la DEK.

**Raison.**

*Pourquoi l'enveloppe.* Changer de mot de passe rechiffre 32 octets, pas la base.
Sans cette indirection, chaque changement de mot de passe imposerait de relire et
réécrire l'intégralité des données — et la récupération par phrase serait
impossible, puisqu'il n'y aurait qu'une seule clé possible.

*Pourquoi GCM et non CBC.* GCM est authentifié. Un octet modifié dans le fichier
fait échouer le déchiffrement au lieu de produire des données silencieusement
corrompues. Pour une base de données, la différence est décisive.

*Pourquoi deux couches.* La clé dérivée du mot de passe protège même contre
quelqu'un disposant d'un accès complet à la session Windows. La couche DPAPI,
elle, ne protège que contre un accès *extérieur* à cette session — mais elle
permet « se souvenir de moi ». L'utilisateur choisit : sans la case cochée, seule
la première couche existe.

*Pourquoi une base par compte.* L'isolation devient **physique** en plus d'être
logique. Les données d'un autre utilisateur ne sont pas seulement filtrées : elles
ne sont pas déchiffrables. Les colonnes `user_id` sont conservées dans le coffre
malgré la redondance, pour que la seconde couche reste vérifiable par les tests.

*Pourquoi `accounts.db` reste en clair.* Il faut pouvoir afficher la liste des
profils avant toute authentification. Il ne contient donc que l'identité visible
et des clés enveloppées — jamais une tâche, jamais une note.

**Impact.**

- **Perdre le mot de passe ET la phrase, c'est perdre les données.** Il n'existe
  aucune porte dérobée, parce qu'une porte dérobée serait aussi une entrée. La
  phrase est affichée une seule fois, sur un écran qui bloque l'accès à
  l'application tant qu'elle n'est pas acquittée.
- Le coffre entier vit **en mémoire** pendant la session. Acceptable pour
  quelques milliers de tâches ; ce n'est pas une architecture pour des millions
  de lignes.
- L'écriture est **synchrone après chaque modification**, avec un renommage
  atomique. Différer gagnerait quelques millisecondes au prix d'une fenêtre où
  une coupure perdrait du travail déjà confirmé à l'écran.
- Compte et coffre vivent dans deux fichiers : **aucune transaction ne les couvre
  ensemble**. L'inscription crée donc le coffre en premier, et le supprime si
  l'insertion du compte échoue. Un coffre orphelin est inerte ; un compte sans
  coffre serait inutilisable.
- La clé est effacée en mémoire (`Buffer.fill(0)`) à la déconnexion : sans cela,
  elle subsisterait jusqu'au passage du ramasse-miettes, donc potentiellement
  dans un fichier de vidage mémoire.

**Ce que cela ne protège pas.** Un programme malveillant s'exécutant sous la
session de l'utilisateur *pendant* qu'il travaille : le coffre est alors ouvert
en mémoire. Aucun chiffrement au repos ne protège de cela ; c'est le rôle de
l'hygiène système et du chiffrement de disque complet.
