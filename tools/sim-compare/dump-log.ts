import { HeadlessGame } from '../../src/sim/HeadlessGame';
import { HeuristicAI } from '../../src/sim/ai/HeuristicAI';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SEEDS = [1, 2, 3];
const lines: string[] = [];

for (const seed of SEEDS) {
  const ai = new HeuristicAI();
  ai.logging = true;
  const game = new HeadlessGame(seed);
  const result = game.runGame(ai);

  lines.push(`${'═'.repeat(70)}`);
  lines.push(`  SEED ${seed}  —  ${result.outcome}  wave ${result.waveReached}  gold ${result.finalGold}  lives ${result.finalLives}`);
  lines.push(`${'═'.repeat(70)}`);
  lines.push(...ai.log);

  const towers = result.towerSummaries;
  if (towers.length > 0) {
    lines.push(`\n  Final towers:`);
    for (const t of towers) {
      const label = t.comboKey ?? `${t.gem} q${t.quality}`;
      lines.push(`    ${label} — kills:${t.kills} dmg:${Math.round(t.damageDealt)}`);
    }
  }
  lines.push('');
}

const outPath = resolve(__dirname, 'results', 'heuristic-log.txt');
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`Written to ${outPath}`);
