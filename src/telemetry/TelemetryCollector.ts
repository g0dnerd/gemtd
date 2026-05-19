import type { Game } from "../game/Game";
import type { State } from "../game/State";
import type { EventBus } from "../events/EventBus";
import type { CreepKind } from "../data/creeps";

interface WaveSnapshot {
  wave: number;
  lives: number;
  gold: number;
  kills: number;
  leaks: number;
  spawned: number;
  durationTicks: number;
  chanceTier: number;
  towerCount: number;
  rockCount: number;
  comboCount: number;
  keeperQuality: number;
  totalDamage: number;
  avgPathProgress: number;
  maxPathProgress: number;
  avgTicksToKill: number;
  avgTowerQuality: number;
  gemTypeCount: number;
  maxUpgradeTier: number;
}

interface CreepKindBucket {
  spawned: number;
  kills: number;
  leaks: number;
  pathProgressSum: number;
  maxPathProgress: number;
  ticksToKillSum: number;
  totalHpSpawned: number;
}

interface WaveCreepStat extends CreepKindBucket {
  wave: number;
  creepKind: CreepKind;
}

interface WaveGemDamage {
  wave: number;
  gem: string;
  isCombo: boolean;
  damage: number;
  kills: number;
}

interface TowerSnapshot {
  gem: string;
  quality: number;
  comboKey: string;
  upgradeTier: number;
  kills: number;
  totalDamage: number;
  placedWave: number;
  x: number;
  y: number;
}

interface TelemetryEvent {
  type: string;
  wave: number;
  gold: number;
  gem: string;
  quality: number;
  cost: number;
  chanceTier: number;
  detail: string;
  value1: number;
}

export class TelemetryCollector {
  private readonly runId: string;
  private readonly mode: "normal" | "hardcore" | "blueprint";
  private readonly state: State;
  private readonly bus: EventBus;
  private readonly unsubs: Array<() => void> = [];
  private readonly waves: WaveSnapshot[] = [];
  private readonly events: TelemetryEvent[] = [];
  private readonly waveCreepStats: WaveCreepStat[] = [];
  private readonly waveGemDamage: WaveGemDamage[] = [];

  private waveStartTick = 0;
  private towerDamageAtWaveStart = 0;
  private pathProgressSum = 0;
  private maxKillPathProgress = 0;
  private ticksToKillSum = 0;
  private maxChanceTier = 0;
  private downgradesUsed = 0;
  private totalLeaks = 0;
  private cleanWaves = 0;
  private flushed = false;
  private readonly upgradeDamage = new Map<
    number,
    Array<{ tier: number; damage: number; wave: number }>
  >();
  private readonly kindBuckets = new Map<CreepKind, CreepKindBucket>();
  private readonly towerWaveStart = new Map<number, { damage: number; kills: number }>();

  constructor(game: Game) {
    this.runId = crypto.randomUUID();
    this.state = game.state;
    this.bus = game.bus;

    if (game.state.hardcore) this.mode = "hardcore";
    else if (game.blueprintMode) this.mode = "blueprint";
    else this.mode = "normal";

    this.maxChanceTier = this.state.chanceTier;
    this.subscribe();
  }

  private subscribe(): void {
    const s = this.state;
    const b = this.bus;

    this.unsubs.push(
      b.on("wave:start", () => {
        this.waveStartTick = s.tick;
        this.towerDamageAtWaveStart = s.towers.reduce(
          (sum, t) => sum + t.totalDamage,
          0,
        );
        this.pathProgressSum = 0;
        this.maxKillPathProgress = 0;
        this.ticksToKillSum = 0;
        this.kindBuckets.clear();
        this.towerWaveStart.clear();
        for (const t of s.towers) {
          this.towerWaveStart.set(t.id, { damage: t.totalDamage, kills: t.kills });
        }

        const kept = s.keptTowerIdThisRound;
        if (kept !== null) {
          const tower = s.towers.find((t) => t.id === kept);
          if (tower) {
            this.events.push({
              type: "keeper",
              wave: s.wave,
              gold: s.gold,
              gem: tower.gem,
              quality: tower.quality,
              cost: 0,
              chanceTier: s.chanceTier,
              detail: tower.comboKey ?? "",
              value1: tower.upgradeTier ?? 0,
            });
          }
        }
      }),

      b.on("creep:spawn", ({ kind, maxHp }) => {
        const bucket = this.getKindBucket(kind);
        bucket.spawned++;
        bucket.totalHpSpawned += maxHp;
      }),

      b.on("creep:die", ({ kind, pathProgress, ticksAlive }) => {
        this.pathProgressSum += pathProgress;
        this.maxKillPathProgress = Math.max(this.maxKillPathProgress, pathProgress);
        this.ticksToKillSum += ticksAlive;
        const bucket = this.getKindBucket(kind);
        bucket.kills++;
        bucket.pathProgressSum += pathProgress;
        bucket.maxPathProgress = Math.max(bucket.maxPathProgress, pathProgress);
        bucket.ticksToKillSum += ticksAlive;
      }),

      b.on("creep:leak", ({ kind, hp, liveCost }) => {
        this.pathProgressSum += 1.0;
        const bucket = this.getKindBucket(kind);
        bucket.leaks++;
        bucket.pathProgressSum += 1.0;
        bucket.maxPathProgress = 1.0;
        this.events.push({
          type: "leak",
          wave: s.wave,
          gold: s.gold,
          gem: "",
          quality: 0,
          cost: liveCost,
          chanceTier: s.chanceTier,
          detail: kind,
          value1: hp,
        });
      }),

      b.on("wave:end", () => {
        const ws = s.waveStats;
        const totalDamageNow = s.towers.reduce(
          (sum, t) => sum + t.totalDamage,
          0,
        );

        const avgTowerQuality = s.towers.length > 0
          ? s.towers.reduce((sum, t) => sum + t.quality, 0) / s.towers.length
          : 0;
        const gemTypes = new Set(s.towers.map((t) => t.gem));
        const maxUpgradeTier = s.towers.reduce(
          (max, t) => Math.max(max, t.upgradeTier ?? 0),
          0,
        );

        this.waves.push({
          wave: s.wave,
          lives: s.lives,
          gold: s.gold,
          kills: ws.killedThisWave,
          leaks: ws.leakedThisWave,
          spawned: ws.spawnedThisWave,
          durationTicks: s.tick - this.waveStartTick,
          chanceTier: s.chanceTier,
          towerCount: s.towers.length,
          rockCount: s.rocks.length,
          comboCount: s.towers.filter((t) => t.comboKey).length,
          keeperQuality:
            s.keptTowerIdThisRound !== null
              ? (s.towers.find((t) => t.id === s.keptTowerIdThisRound)
                  ?.quality ?? 0)
              : 0,
          totalDamage: totalDamageNow - this.towerDamageAtWaveStart,
          avgPathProgress: ws.killedThisWave + ws.leakedThisWave > 0
            ? this.pathProgressSum / (ws.killedThisWave + ws.leakedThisWave)
            : 0,
          maxPathProgress: this.maxKillPathProgress,
          avgTicksToKill: ws.killedThisWave > 0 ? Math.round(this.ticksToKillSum / ws.killedThisWave) : 0,
          avgTowerQuality,
          gemTypeCount: gemTypes.size,
          maxUpgradeTier,
        });

        for (const [kind, bucket] of this.kindBuckets) {
          this.waveCreepStats.push({
            wave: s.wave,
            creepKind: kind,
            spawned: bucket.spawned,
            kills: bucket.kills,
            leaks: bucket.leaks,
            pathProgressSum: bucket.pathProgressSum,
            maxPathProgress: bucket.maxPathProgress,
            ticksToKillSum: bucket.ticksToKillSum,
            totalHpSpawned: bucket.totalHpSpawned,
          });
        }

        const gemDmg = new Map<string, WaveGemDamage>();
        for (const t of s.towers) {
          const snap = this.towerWaveStart.get(t.id);
          const dmgDelta = t.totalDamage - (snap?.damage ?? t.totalDamage);
          const killsDelta = t.kills - (snap?.kills ?? t.kills);
          if (dmgDelta <= 0 && killsDelta <= 0) continue;
          const isCombo = !!t.comboKey;
          const key = `${t.gem}:${isCombo ? 1 : 0}`;
          const existing = gemDmg.get(key);
          if (existing) {
            existing.damage += dmgDelta;
            existing.kills += killsDelta;
          } else {
            gemDmg.set(key, { wave: s.wave, gem: t.gem, isCombo, damage: dmgDelta, kills: killsDelta });
          }
        }
        for (const entry of gemDmg.values()) {
          this.waveGemDamage.push(entry);
        }

        this.totalLeaks += ws.leakedThisWave;
        if (ws.leakedThisWave === 0) this.cleanWaves++;
      }),

      b.on("chance:upgrade", ({ tier, cost }) => {
        this.maxChanceTier = Math.max(this.maxChanceTier, tier);
        this.events.push({
          type: "chance_upgrade",
          wave: s.wave,
          gold: s.gold,
          gem: "",
          quality: 0,
          cost,
          chanceTier: tier,
          detail: "",
          value1: 0,
        });
      }),

      b.on("combine:done", ({ inputIds, outputGem, outputQuality }) => {
        this.events.push({
          type: "combo",
          wave: s.wave,
          gold: s.gold,
          gem: outputGem,
          quality: outputQuality,
          cost: 0,
          chanceTier: s.chanceTier,
          detail: "",
          value1: inputIds.length,
        });
      }),

      b.on("rock:remove", ({ cost }) => {
        this.events.push({
          type: "rock_remove",
          wave: s.wave,
          gold: s.gold,
          gem: "",
          quality: 0,
          cost,
          chanceTier: s.chanceTier,
          detail: "",
          value1: s.rocksRemoved,
        });
      }),

      b.on("tower:upgrade", ({ id, tier }) => {
        const tower = s.towers.find((t) => t.id === id);
        if (!tower) return;
        let records = this.upgradeDamage.get(id);
        if (!records) {
          records = [];
          this.upgradeDamage.set(id, records);
        }
        records.push({ tier, damage: tower.totalDamage, wave: s.wave });
      }),

      b.on("tower:downgrade", ({ gem, oldQuality, newQuality }) => {
        this.downgradesUsed++;
        this.events.push({
          type: "downgrade",
          wave: s.wave,
          gold: s.gold,
          gem,
          quality: newQuality,
          cost: 0,
          chanceTier: s.chanceTier,
          detail: String(oldQuality),
          value1: 0,
        });
      }),

      b.on("phase:enter", ({ phase }) => {
        if (phase === "gameover" || phase === "victory") {
          this.flush(phase === "victory" ? "victory" : "gameover");
        }
      }),
    );
  }

  private getKindBucket(kind: CreepKind): CreepKindBucket {
    let bucket = this.kindBuckets.get(kind);
    if (!bucket) {
      bucket = { spawned: 0, kills: 0, leaks: 0, pathProgressSum: 0, maxPathProgress: 0, ticksToKillSum: 0, totalHpSpawned: 0 };
      this.kindBuckets.set(kind, bucket);
    }
    return bucket;
  }

  private flush(outcome: "gameover" | "victory"): void {
    if (this.flushed) return;
    this.flushed = true;

    const s = this.state;
    const towers: TowerSnapshot[] = [];
    for (const t of s.towers) {
      const snaps = this.upgradeDamage.get(t.id);
      if (snaps && snaps.length > 0 && t.comboKey) {
        const base = { gem: t.gem, quality: t.quality, comboKey: t.comboKey, x: t.x, y: t.y };
        towers.push({ ...base, upgradeTier: 0, kills: 0, totalDamage: snaps[0].damage, placedWave: t.placedWave });
        for (let i = 0; i < snaps.length - 1; i++) {
          towers.push({ ...base, upgradeTier: snaps[i].tier, kills: 0, totalDamage: snaps[i + 1].damage - snaps[i].damage, placedWave: snaps[i].wave });
        }
        const last = snaps[snaps.length - 1];
        towers.push({ ...base, upgradeTier: last.tier, kills: t.kills, totalDamage: t.totalDamage - last.damage, placedWave: last.wave });
      } else {
        towers.push({ gem: t.gem, quality: t.quality, comboKey: t.comboKey ?? "", upgradeTier: t.upgradeTier ?? 0, kills: t.kills, totalDamage: t.totalDamage, placedWave: t.placedWave, x: t.x, y: t.y });
      }
    }

    const header = {
      runId: this.runId,
      version: __GAME_VERSION__,
      mode: this.mode,
      outcome,
    };

    const run = {
      waveReached: s.wave,
      finalLives: s.lives,
      finalGold: s.gold,
      totalKills: s.totalKills,
      towerCount: s.towers.length,
      comboCount: s.towers.filter((t) => t.comboKey).length,
      maxChanceTier: this.maxChanceTier,
      rocksRemoved: s.rocksRemoved,
      downgradesUsed: this.downgradesUsed,
      durationTicks: s.tick,
      totalLeaks: this.totalLeaks,
      cleanWaves: this.cleanWaves,
    };

    this.send({
      ...header,
      run,
      waves: this.waves,
      towers,
      events: this.events,
      waveCreepStats: this.waveCreepStats,
      waveGemDamage: this.waveGemDamage,
    });
  }

  private send(payload: Record<string, unknown>): void {
    const body = JSON.stringify(payload);
    const url = import.meta.env.DEV
      ? "http://localhost:3456/api/telemetry"
      : "/api/telemetry";

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }).catch(() => {});
  }

  detach(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }
}
