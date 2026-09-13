-- Horodatage de dernière consultation, par app, pour les pastilles « nouveau »
-- façon Discord : une app affiche un point tant que des tâches ou des
-- messages du chat général sont apparus depuis la dernière visite de cet
-- onglet précis. NULL veut dire « jamais visité » — tout ce qui existe déjà
-- compte alors comme nouveau.
ALTER TABLE projects ADD COLUMN tasks_seen_at TEXT;
ALTER TABLE projects ADD COLUMN chat_seen_at TEXT;
