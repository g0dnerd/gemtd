import { WAVES } from "../src/data/waves";
import { waveDifficulty } from "../src/data/wave-difficulty";

const diffs = WAVES.map((w) => ({
  wave: w.number,
  diff: waveDifficulty(w),
  kinds: w.groups.map((g) => `${g.kind}×${g.count}`).join(", "),
  hasAir: w.groups.some((g) => g.kind === "shrike"),
  isBoss: w.groups.some(
    (g) => g.kind === "amalgam" || g.kind === "gestation",
  ),
  isContainer: w.groups.some((g) =>
    ["vessel", "coral", "anemone", "gestation"].includes(g.kind),
  ),
}));

console.log("Wave | Difficulty     | Ratio | Tag  | Kinds");
console.log("-----|----------------|-------|------|------");

let prev = 0;
for (const d of diffs) {
  const ratio = prev > 0 ? (d.diff / prev).toFixed(2) : "    -";
  const tag = d.hasAir
    ? "AIR "
    : d.isBoss
      ? "BOSS"
      : d.isContainer
        ? "CONT"
        : "    ";
  const r = parseFloat(ratio);
  const flag =
    r < 0.85 && prev > 0
      ? " ◄ DIP"
      : r > 3.0 && prev > 0
        ? " ◄ SPIKE"
        : "";
  console.log(
    `${String(d.wave).padStart(4)} | ${String(d.diff).padStart(14)} | ${ratio} | ${tag} | ${d.kinds}${flag}`,
  );
  prev = d.diff;
}

const tierCount = Math.floor(WAVES.length / 10);
console.log("");
console.log("--- Tier averages ---");
for (let t = 0; t < tierCount; t++) {
  const tierDiffs = diffs.slice(t * 10, t * 10 + 10);
  const avg = tierDiffs.reduce((s, d) => s + d.diff, 0) / 10;
  console.log(
    `  Tier ${t + 1} (waves ${t * 10 + 1}-${t * 10 + 10}): avg ${Math.round(avg).toLocaleString()}`,
  );
}
