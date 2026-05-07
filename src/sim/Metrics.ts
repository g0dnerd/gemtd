import type { EventBus } from '../events/EventBus';
import type { State } from '../game/State';
import type { WaveSummary, TowerSummary } from './types';

interface WaveTracker {
  startTick: number;
  endTick: number;
  totalDamage: number;
  totalHpSpawned: number;
  kills: number;
  leaks: number;
  spawns: number;
  goldAtEnd: number;
  livesAtEnd: number;
  towersAtEnd: number;
}

export class Metrics {
  private currentWave = 0;
  private waves = new Map<number, WaveTracker>();
  private towerDamage = new Map<number, number>();
  private gemDmg = new Map<string, number>();
  private unsubs: (() => void)[] = [];

  constructor(
    private bus: EventBus,
    private state: State,
  ) {
    this.attach();
  }

  private attach(): void {
    this.unsubs.push(
      this.bus.on('wave:start', ({ wave }) => {
        this.currentWave = wave;
        this.waves.set(wave, {
          startTick: this.state.tick,
          endTick: 0,
          totalDamage: 0,
          totalHpSpawned: 0,
          kills: 0,
          leaks: 0,
          spawns: 0,
          goldAtEnd: 0,
          livesAtEnd: 0,
          towersAtEnd: 0,
        });
      }),
      this.bus.on('wave:end', ({ wave }) => {
        const w = this.waves.get(wave);
        if (!w) return;
        w.endTick = this.state.tick;
        w.goldAtEnd = this.state.gold;
        w.livesAtEnd = this.state.lives;
        w.towersAtEnd = this.state.towers.length;
      }),
      this.bus.on('creep:spawn', ({ id }) => {
        const w = this.waves.get(this.currentWave);
        if (!w) return;
        w.spawns++;
        const creep = this.state.creeps.find((c) => c.id === id);
        if (creep) w.totalHpSpawned += creep.maxHp;
      }),
      this.bus.on('creep:die', () => {
        const w = this.waves.get(this.currentWave);
        if (w) w.kills++;
      }),
      this.bus.on('creep:leak', () => {
        const w = this.waves.get(this.currentWave);
        if (w) w.leaks++;
      }),
      this.bus.on('tower:hit', ({ id, damage }) => {
        const w = this.waves.get(this.currentWave);
        if (w) w.totalDamage += damage;
        this.towerDamage.set(id, (this.towerDamage.get(id) ?? 0) + damage);
        const tower = this.state.towers.find((t) => t.id === id);
        if (tower) {
          this.gemDmg.set(tower.gem, (this.gemDmg.get(tower.gem) ?? 0) + damage);
        }
      }),
    );
  }

  detach(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }

  waveSummaries(): WaveSummary[] {
    const out: WaveSummary[] = [];
    for (const [wave, w] of this.waves) {
      if (w.endTick === 0) continue;
      out.push({
        wave,
        creepsSpawned: w.spawns,
        killed: w.kills,
        leaked: w.leaks,
        livesRemaining: w.livesAtEnd,
        goldAtEnd: w.goldAtEnd,
        towersCount: w.towersAtEnd,
        durationTicks: w.endTick - w.startTick,
        totalDamageDealt: w.totalDamage,
        totalHpSpawned: w.totalHpSpawned,
      });
    }
    return out.sort((a, b) => a.wave - b.wave);
  }

  towerSummaries(): TowerSummary[] {
    return this.state.towers.map((t) => ({
      id: t.id,
      gem: t.gem,
      quality: t.quality,
      comboKey: t.comboKey,
      kills: t.kills,
      damageDealt: this.towerDamage.get(t.id) ?? 0,
    }));
  }

  gemDamageShare(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [gem, dmg] of this.gemDmg) out[gem] = dmg;
    return out;
  }

  gemKillShare(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of this.state.towers) {
      out[t.gem] = (out[t.gem] ?? 0) + t.kills;
    }
    return out;
  }

  dpsVsHpPerWave(): Array<{ wave: number; totalDamage: number; totalHp: number; ratio: number }> {
    const out: Array<{ wave: number; totalDamage: number; totalHp: number; ratio: number }> = [];
    for (const [wave, w] of this.waves) {
      out.push({
        wave,
        totalDamage: w.totalDamage,
        totalHp: w.totalHpSpawned,
        ratio: w.totalHpSpawned > 0 ? w.totalDamage / w.totalHpSpawned : 0,
      });
    }
    return out.sort((a, b) => a.wave - b.wave);
  }

  economyCurve(): Array<{ wave: number; gold: number }> {
    const out: Array<{ wave: number; gold: number }> = [];
    for (const [wave, w] of this.waves) {
      out.push({ wave, gold: w.goldAtEnd });
    }
    return out.sort((a, b) => a.wave - b.wave);
  }
}
