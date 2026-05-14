CREATE TABLE runs (
  run_id          TEXT PRIMARY KEY,
  version         TEXT    NOT NULL,
  mode            TEXT    NOT NULL,
  outcome         TEXT    NOT NULL,
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
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE waves (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id         TEXT    NOT NULL REFERENCES runs(run_id),
  wave           INTEGER NOT NULL,
  lives          INTEGER NOT NULL,
  gold           INTEGER NOT NULL,
  kills          INTEGER NOT NULL,
  leaks          INTEGER NOT NULL,
  spawned        INTEGER NOT NULL,
  duration_ticks INTEGER NOT NULL,
  chance_tier    INTEGER NOT NULL,
  tower_count    INTEGER NOT NULL,
  rock_count     INTEGER NOT NULL,
  combo_count    INTEGER NOT NULL,
  keeper_quality REAL    NOT NULL DEFAULT 0,
  total_damage   REAL    NOT NULL DEFAULT 0
);
CREATE INDEX idx_waves_run  ON waves(run_id);
CREATE INDEX idx_waves_wave ON waves(wave);

CREATE TABLE towers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT    NOT NULL REFERENCES runs(run_id),
  gem          TEXT    NOT NULL,
  quality      INTEGER NOT NULL,
  combo_key    TEXT    NOT NULL DEFAULT '',
  upgrade_tier INTEGER NOT NULL DEFAULT 0,
  kills        INTEGER NOT NULL DEFAULT 0,
  total_damage REAL    NOT NULL DEFAULT 0,
  placed_wave  INTEGER NOT NULL,
  x            INTEGER NOT NULL,
  y            INTEGER NOT NULL
);
CREATE INDEX idx_towers_run   ON towers(run_id);
CREATE INDEX idx_towers_combo ON towers(combo_key);

CREATE TABLE events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT    NOT NULL REFERENCES runs(run_id),
  event_type  TEXT    NOT NULL,
  wave        INTEGER NOT NULL,
  gold        INTEGER NOT NULL,
  gem         TEXT    NOT NULL DEFAULT '',
  quality     INTEGER NOT NULL DEFAULT 0,
  cost        INTEGER NOT NULL DEFAULT 0,
  chance_tier INTEGER NOT NULL DEFAULT 0,
  detail      TEXT    NOT NULL DEFAULT '',
  value1      REAL    NOT NULL DEFAULT 0
);
CREATE INDEX idx_events_run  ON events(run_id);
CREATE INDEX idx_events_type ON events(event_type);
