-- =============================================================================
-- 002_profile — Personnalisation du profil
--
-- `accent_color` vit sur `users` et non dans `settings` : l'écran de sélection
-- de profil doit pouvoir teinter chaque carte AVANT toute authentification, or
-- les paramètres ne sont lisibles qu'une fois la session ouverte. La couleur
-- d'accent fait partie de l'identité visible du profil, pas de ses préférences
-- privées — le thème clair/sombre, lui, reste dans `settings`.
--
-- Aucune contrainte CHECK sur la valeur : la palette est validée par Zod côté
-- application, ce qui permet de la faire évoluer sans migration.
-- =============================================================================

ALTER TABLE users ADD COLUMN accent_color TEXT NOT NULL DEFAULT '#3D7BFF';
