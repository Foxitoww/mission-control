-- Avancement individuel d'une tâche, synchronisé avec son statut par le
-- service (tasks.service.ts) : 0 % à la reprise à zéro, 100 % en terminant.
-- Un CHECK simple seulement : ALTER TABLE n'admet pas de contrainte
-- référençant une autre colonne, l'invariant croisé avec `status` reste donc
-- du ressort du service, comme celui de `completed_at` avant lui.
ALTER TABLE tasks ADD COLUMN progress INTEGER NOT NULL DEFAULT 0
  CHECK (progress BETWEEN 0 AND 100);

-- Les tâches déjà terminées avant cette migration n'ont pas eu l'occasion de
-- passer par le service : on les aligne une fois, ici, plutôt que de les
-- laisser afficher 0 % sur une tâche cochée terminée.
UPDATE tasks SET progress = 100 WHERE status = 'COMPLETED';
