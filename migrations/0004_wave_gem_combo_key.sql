ALTER TABLE wave_gem_damage ADD COLUMN combo_key TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_wgd_combo ON wave_gem_damage(combo_key);
