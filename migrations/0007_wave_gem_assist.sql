CREATE TABLE wave_gem_assist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  wave INTEGER NOT NULL,
  gem TEXT NOT NULL,
  combo_key TEXT NOT NULL DEFAULT '',
  upgrade_tier INTEGER NOT NULL DEFAULT 0,
  dmg_aura_assist REAL NOT NULL DEFAULT 0,
  vuln_assist REAL NOT NULL DEFAULT 0,
  armor_shred_assist REAL NOT NULL DEFAULT 0,
  atkspeed_assist REAL NOT NULL DEFAULT 0,
  bonus_gold REAL NOT NULL DEFAULT 0
);
CREATE INDEX idx_wga_run ON wave_gem_assist(run_id);
CREATE INDEX idx_wga_wave ON wave_gem_assist(wave);
