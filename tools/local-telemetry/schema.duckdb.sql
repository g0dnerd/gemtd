-- Consolidated DuckDB schema for the local telemetry DB.
-- Reproduces the final shape of migrations/0001..0007 combined.
-- DuckDB-specific: autoincrement `id` columns from the SQLite schema are
-- omitted (no code reads or writes them); CHECK/DEFAULT syntax tweaks vs D1.

CREATE TABLE runs (
  run_id          VARCHAR PRIMARY KEY,
  version         VARCHAR NOT NULL,
  mode            VARCHAR NOT NULL,
  outcome         VARCHAR NOT NULL,
  wave_reached    INTEGER NOT NULL,
  final_lives     INTEGER NOT NULL,
  final_gold      INTEGER NOT NULL,
  total_kills     INTEGER NOT NULL,
  tower_count     INTEGER NOT NULL,
  combo_count     INTEGER NOT NULL,
  max_chance_tier INTEGER NOT NULL,
  rocks_removed   INTEGER NOT NULL,
  downgrades_used INTEGER NOT NULL,
  duration_ticks  INTEGER NOT NULL,
  total_leaks     INTEGER NOT NULL,
  clean_waves     INTEGER NOT NULL,
  ai              VARCHAR NOT NULL DEFAULT '',
  seed            INTEGER NOT NULL DEFAULT 0,
  created_at      VARCHAR NOT NULL DEFAULT (strftime(get_current_timestamp(), '%Y-%m-%d %H:%M:%S'))
);

CREATE TABLE waves (
  run_id             VARCHAR NOT NULL REFERENCES runs(run_id),
  wave               INTEGER NOT NULL,
  lives              INTEGER NOT NULL,
  gold               INTEGER NOT NULL,
  kills              INTEGER NOT NULL,
  leaks              INTEGER NOT NULL,
  spawned            INTEGER NOT NULL,
  duration_ticks     INTEGER NOT NULL,
  chance_tier        INTEGER NOT NULL,
  tower_count        INTEGER NOT NULL,
  rock_count         INTEGER NOT NULL,
  combo_count        INTEGER NOT NULL,
  keeper_quality     DOUBLE  NOT NULL DEFAULT 0,
  total_damage       DOUBLE  NOT NULL DEFAULT 0,
  avg_path_progress  DOUBLE  NOT NULL DEFAULT 0,
  max_path_progress  DOUBLE  NOT NULL DEFAULT 0,
  avg_ticks_to_kill  DOUBLE  NOT NULL DEFAULT 0,
  avg_tower_quality  DOUBLE  NOT NULL DEFAULT 0,
  gem_type_count     INTEGER NOT NULL DEFAULT 0,
  max_upgrade_tier   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_waves_run  ON waves(run_id);
CREATE INDEX idx_waves_wave ON waves(wave);

CREATE TABLE towers (
  run_id       VARCHAR NOT NULL REFERENCES runs(run_id),
  gem          VARCHAR NOT NULL,
  quality      INTEGER NOT NULL,
  combo_key    VARCHAR NOT NULL DEFAULT '',
  upgrade_tier INTEGER NOT NULL DEFAULT 0,
  kills        INTEGER NOT NULL DEFAULT 0,
  total_damage DOUBLE  NOT NULL DEFAULT 0,
  placed_wave  INTEGER NOT NULL,
  x            INTEGER NOT NULL,
  y            INTEGER NOT NULL
);
CREATE INDEX idx_towers_run   ON towers(run_id);
CREATE INDEX idx_towers_combo ON towers(combo_key);

CREATE TABLE events (
  run_id      VARCHAR NOT NULL REFERENCES runs(run_id),
  event_type  VARCHAR NOT NULL,
  wave        INTEGER NOT NULL,
  gold        INTEGER NOT NULL,
  gem         VARCHAR NOT NULL DEFAULT '',
  quality     INTEGER NOT NULL DEFAULT 0,
  cost        INTEGER NOT NULL DEFAULT 0,
  chance_tier INTEGER NOT NULL DEFAULT 0,
  detail      VARCHAR NOT NULL DEFAULT '',
  value1      DOUBLE  NOT NULL DEFAULT 0
);
CREATE INDEX idx_events_run  ON events(run_id);
CREATE INDEX idx_events_type ON events(event_type);

CREATE TABLE wave_creep_stats (
  run_id            VARCHAR NOT NULL REFERENCES runs(run_id),
  wave              INTEGER NOT NULL,
  creep_kind        VARCHAR NOT NULL,
  spawned           INTEGER NOT NULL DEFAULT 0,
  kills             INTEGER NOT NULL DEFAULT 0,
  leaks             INTEGER NOT NULL DEFAULT 0,
  avg_path_progress DOUBLE  NOT NULL DEFAULT 0,
  max_path_progress DOUBLE  NOT NULL DEFAULT 0,
  avg_ticks_to_kill DOUBLE  NOT NULL DEFAULT 0,
  total_hp_spawned  DOUBLE  NOT NULL DEFAULT 0
);
CREATE INDEX idx_wcs_run  ON wave_creep_stats(run_id);
CREATE INDEX idx_wcs_wave ON wave_creep_stats(wave);

CREATE TABLE wave_gem_damage (
  run_id       VARCHAR NOT NULL REFERENCES runs(run_id),
  wave         INTEGER NOT NULL,
  gem          VARCHAR NOT NULL,
  is_combo     INTEGER NOT NULL DEFAULT 0,
  combo_key    VARCHAR NOT NULL DEFAULT '',
  upgrade_tier INTEGER NOT NULL DEFAULT 0,
  damage       DOUBLE  NOT NULL DEFAULT 0,
  kills        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_wgd_run   ON wave_gem_damage(run_id);
CREATE INDEX idx_wgd_wave  ON wave_gem_damage(wave);
CREATE INDEX idx_wgd_combo ON wave_gem_damage(combo_key);

CREATE TABLE wave_gem_assist (
  run_id             VARCHAR NOT NULL REFERENCES runs(run_id),
  wave               INTEGER NOT NULL,
  gem                VARCHAR NOT NULL,
  combo_key          VARCHAR NOT NULL DEFAULT '',
  upgrade_tier       INTEGER NOT NULL DEFAULT 0,
  dmg_aura_assist    DOUBLE  NOT NULL DEFAULT 0,
  vuln_assist        DOUBLE  NOT NULL DEFAULT 0,
  armor_shred_assist DOUBLE  NOT NULL DEFAULT 0,
  atkspeed_assist    DOUBLE  NOT NULL DEFAULT 0,
  bonus_gold         DOUBLE  NOT NULL DEFAULT 0
);
CREATE INDEX idx_wga_run  ON wave_gem_assist(run_id);
CREATE INDEX idx_wga_wave ON wave_gem_assist(wave);
