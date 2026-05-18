CREATE TABLE wave_creep_stats (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id            TEXT    NOT NULL REFERENCES runs(run_id),
  wave              INTEGER NOT NULL,
  creep_kind        TEXT    NOT NULL,
  spawned           INTEGER NOT NULL DEFAULT 0,
  kills             INTEGER NOT NULL DEFAULT 0,
  leaks             INTEGER NOT NULL DEFAULT 0,
  avg_path_progress REAL    NOT NULL DEFAULT 0,
  max_path_progress REAL    NOT NULL DEFAULT 0,
  avg_ticks_to_kill REAL    NOT NULL DEFAULT 0,
  total_hp_spawned  REAL    NOT NULL DEFAULT 0
);
CREATE INDEX idx_wcs_run  ON wave_creep_stats(run_id);
CREATE INDEX idx_wcs_wave ON wave_creep_stats(wave);

CREATE TABLE wave_gem_damage (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id   TEXT    NOT NULL REFERENCES runs(run_id),
  wave     INTEGER NOT NULL,
  gem      TEXT    NOT NULL,
  is_combo INTEGER NOT NULL DEFAULT 0,
  damage   REAL    NOT NULL DEFAULT 0,
  kills    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_wgd_run  ON wave_gem_damage(run_id);
CREATE INDEX idx_wgd_wave ON wave_gem_damage(wave);

ALTER TABLE waves ADD COLUMN avg_tower_quality  REAL    NOT NULL DEFAULT 0;
ALTER TABLE waves ADD COLUMN gem_type_count     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE waves ADD COLUMN max_upgrade_tier   INTEGER NOT NULL DEFAULT 0;
