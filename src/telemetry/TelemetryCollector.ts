import type { Game } from "../game/Game";
import type { State } from "../game/State";
import type { EventBus } from "../events/EventBus";

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

export interface TelemetryPayload {
  runId: string;
  version: string;
  mode: "normal" | "hardcore" | "blueprint";
  outcome: "gameover" | "victory";
  run: {
    waveReached: number;
    finalLives: number;
    finalGold: number;
    totalKills: number;
    towerCount: number;
    comboCount: number;
    maxChanceTier: number;
    rocksRemoved: number;
    downgradesUsed: number;
    durationTicks: number;
    totalLeaks: number;
    cleanWaves: number;
  };
  waves: WaveSnapshot[];
  towers: TowerSnapshot[];
  events: TelemetryEvent[];
}

export class TelemetryCollector {
  private readonly runId: string;
  private readonly mode: "normal" | "hardcore" | "blueprint";
  private readonly state: State;
  private readonly bus: EventBus;
  private readonly unsubs: Array<() => void> = [];
  private readonly waves: WaveSnapshot[] = [];
  private readonly events: TelemetryEvent[] = [];

  private waveStartTick = 0;
  private towerDamageAtWaveStart = 0;
  private maxChanceTier = 0;
  private downgradesUsed = 0;
  private totalLeaks = 0;
  private cleanWaves = 0;
  private flushed = false;

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

      b.on("wave:end", () => {
        const ws = s.waveStats;
        const totalDamageNow = s.towers.reduce(
          (sum, t) => sum + t.totalDamage,
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
        });

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

  private flush(outcome: "gameover" | "victory"): void {
    if (this.flushed) return;
    this.flushed = true;

    const s = this.state;
    const towers: TowerSnapshot[] = s.towers.map((t) => ({
      gem: t.gem,
      quality: t.quality,
      comboKey: t.comboKey ?? "",
      upgradeTier: t.upgradeTier ?? 0,
      kills: t.kills,
      totalDamage: t.totalDamage,
      placedWave: t.placedWave,
      x: t.x,
      y: t.y,
    }));

    const payload: TelemetryPayload = {
      runId: this.runId,
      version: __GAME_VERSION__,
      mode: this.mode,
      outcome,
      run: {
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
      },
      waves: this.waves,
      towers,
      events: this.events,
    };

    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/telemetry", body);
    } else {
      fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  }

  detach(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }
}
