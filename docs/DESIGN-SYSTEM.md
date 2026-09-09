# MISSION CONTROL — Design System

**Direction artistique : FRENCH AEROSPACE × NASA MISSION CONTROL**

Le thème spatial vit dans la *rigueur*, pas dans la décoration. Pas de fusées, pas de
dégradés néon, pas de police science-fiction. L'inspiration passe par la grille, la
hiérarchie typographique, la nomenclature des états et la télémétrie.

## 1. Règle de langue

Convention authentique des centres de contrôle européens (ESA, CNES) : **les libellés
techniques sont en anglais, la prose est localisée.**

| Élément | Langue | Exemple |
|---|---|---|
| Statuts, télémétrie, en-têtes de section | Anglais, majuscules | `ACTIVE MISSIONS`, `T−03 DAYS`, `NOMINAL` |
| Boutons, aide, messages d'erreur, formulaires | FR / EN selon préférence | « Nouvelle tâche », « Aucune mission active » |

L'utilisateur comprend toujours ce qu'il fait : le vocabulaire spatial habille les
étiquettes, jamais les actions.

## 2. Palette

Le rouge français est un **accent**, pas une couleur de fond. Il est réservé à la
priorité `CRITICAL`, aux erreurs et à la marque. Si l'écran est rouge, quelque chose
ne va pas — c'est le message.

### Thème sombre (identité principale)
```
--mc-void          #0A0E1A   fond le plus profond
--mc-abyss         #0F1524   fond application
--mc-hull          #161D30   surface panneau / carte
--mc-hull-raised   #1E2740   surface élevée (modale, dropdown)
--mc-grid          #2A3552   bordures, séparateurs
--mc-grid-strong   #3A4970   bordure accentuée

--mc-text          #E8ECF4   blanc cassé — jamais #FFF (réduit l'éblouissement)
--mc-text-secondary #A3AEC4
--mc-text-muted    #6B7793

--mc-blue          #3D7BFF   action primaire
--mc-cyan          #4FD5E8   télémétrie / information
--mc-green         #24C38E   nominal / terminé
--mc-amber         #F5A623   attention / bloqué
--mc-red           #E8334A   ROUGE FRANÇAIS — critique uniquement
```

### Thème clair
Fond `#F4F6FA`, surfaces `#FFFFFF`, grille `#DDE3EE`, texte `#0F1524`.
Accents assombris pour tenir le contraste AA sur fond clair.

### Sémantique — la couleur porte du sens, pas de la décoration
| Priorité | Couleur | | Statut | Couleur |
|---|---|---|---|---|
| LOW | `text-muted` | | TODO | `text-muted` |
| MEDIUM | `cyan` | | IN_PROGRESS | `blue` |
| HIGH | `amber` | | BLOCKED | `amber` |
| CRITICAL | `red` | | COMPLETED | `green` |
| | | | ARCHIVED | `text-muted` |

La couleur n'est **jamais** le seul porteur d'information (§24) : chaque état a aussi
une forme, une icône ou un libellé.

## 3. Typographie

Deux familles, **empaquetées localement** — jamais via Google Fonts CDN : l'application
doit fonctionner hors ligne et ne doit émettre aucune requête réseau (§35).

- **Inter** — interface, titres, prose.
- **JetBrains Mono** — télémétrie uniquement : compteurs, identifiants de mission,
  dates relatives, valeurs chiffrées. Avec parcimonie.

| Rôle | Taille / graisse | Notes |
|---|---|---|
| Display | 32 / 700 | titre de page |
| H1 | 24 / 650 | |
| H2 | 18 / 600 | |
| Body | 14 / 400 | base |
| Label | 11 / 600, `letter-spacing: .08em`, majuscules | en-têtes de section |
| Mono-data | 13 / 500, JetBrains Mono, `tabular-nums` | `T−03 DAYS`, `MISSION 014` |
| Caption | 12 / 400, `text-muted` | métadonnées |

`tabular-nums` sur les données chiffrées : les chiffres gardent une largeur constante,
donc un compteur qui s'incrémente ne fait pas tressauter la mise en page.

## 4. Espacement, rayons, ombres

- **Espacement** — grille de 4 px : `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`
- **Rayons** — volontairement serrés (précision, pas rondeur) :
  `2` badge · `6` bouton/input · `10` carte · `14` modale
- **Ombres** — discrètes, plus une lueur (`glow`) réservée à l'état actif/focus.
  Une ombre marque l'élévation, jamais l'importance.

## 5. Primitives à construire

`Button` · `IconButton` · `Input` · `Textarea` · `Select` · `Checkbox` · `Card` ·
`Panel` · `Badge` · `StatusPill` · `PriorityFlag` · `ProgressBar` · `Modal` ·
`Dropdown` · `Tooltip` · `Tabs` · `Toast` · `EmptyState` · `Skeleton` · `Table` ·
`Avatar` · `SearchField` · `DatePicker`

Chaque primitive expose ses états : `default · hover · active · focus-visible ·
disabled · loading · error`. Un écran ne compose que des primitives (§19).

## 6. Micro-interactions (§22)

Durées : `120ms` retour immédiat · `200ms` transition standard · `320ms` entrée de panneau.
Courbe par défaut : `cubic-bezier(0.4, 0, 0.2, 1)`.

L'animation doit **expliquer** un changement d'état (une tâche terminée glisse et
s'estompe → on comprend où elle est partie). Elle ne doit jamais retarder l'utilisateur.

`prefers-reduced-motion: reduce` supprime les déplacements et conserve uniquement les
fondus — obligatoire, pas optionnel (§24).

## 7. Accessibilité — non négociable

- Contraste AA minimum (4.5:1 texte, 3:1 éléments d'interface).
- `:focus-visible` toujours visible, jamais `outline: none` sans remplacement.
- Cibles tactiles ≥ 44 × 44 px sur mobile.
- Drag & drop via **@dnd-kit** : accessible au clavier par défaut (`react-beautiful-dnd`
  est abandonné et non accessible).
- Toute icône seule porte un `aria-label`.
