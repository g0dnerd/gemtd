import { Container, Graphics } from 'pixi.js';
import type { EventBus } from '../events/EventBus';
import { FINE_TILE, TILE } from '../game/constants';
import { GEM_PALETTE } from './theme';
import type { State, TowerState } from '../game/State';
import { COMBO_BY_NAME, comboStatsAtTier } from '../data/combos';
import { gemStats } from '../data/gems';
import type { EffectKind } from '../data/gems';

// ---- Effect data ----

interface RingFx {
  kind: 'ring';
  x: number; y: number;
  maxRadius: number;
  color: number;
  age: number; lifetime: number;
}

interface SnowParticle { x: number; y: number; vy: number }

interface SnowBurstFx {
  kind: 'snowburst';
  particles: SnowParticle[];
  age: number; lifetime: number;
}

interface TendrilFx {
  kind: 'tendril';
  fromX: number; fromY: number;
  toX: number; toY: number;
  curve: number;
  age: number; lifetime: number;
}

interface CoinFx {
  kind: 'coin';
  x: number; y: number;
  age: number; lifetime: number;
}

interface SnowflakeFx {
  kind: 'snowflake';
  x: number; y: number;
  age: number; lifetime: number;
}

interface DriftFx {
  kind: 'drift';
  x: number; y: number;
  vx: number; vy: number;
  color: number;
  size: number;
  age: number; lifetime: number;
}

type Fx = RingFx | SnowBurstFx | TendrilFx | CoinFx | SnowflakeFx | DriftFx;

export class VfxRenderer {
  private pool: Fx[] = [];
  private gfx: Graphics | null = null;
  private frame = 0;

  constructor(bus: EventBus) {
    bus.on('vfx:nova', (e) => {
      this.pool.push({
        kind: 'ring', x: e.x, y: e.y,
        maxRadius: e.rangePx, color: GEM_PALETTE.diamond.light,
        age: 0, lifetime: 20,
      });
    });

    bus.on('vfx:periodicFreeze', (e) => {
      const particles: SnowParticle[] = [];
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * e.rangePx;
        particles.push({
          x: e.x + Math.cos(a) * d,
          y: e.y + Math.sin(a) * d - e.rangePx * 0.3,
          vy: 0.8 + Math.random() * 0.8,
        });
      }
      this.pool.push({ kind: 'snowburst', particles, age: 0, lifetime: 30 });
    });

    bus.on('vfx:deathNova', (e) => {
      this.pool.push({
        kind: 'ring', x: e.x, y: e.y,
        maxRadius: e.radiusPx, color: GEM_PALETTE.ruby.mid,
        age: 0, lifetime: 18,
      });
    });

    bus.on('vfx:deathSpread', (e) => {
      for (let i = 0; i < e.targets.length; i++) {
        this.pool.push({
          kind: 'tendril',
          fromX: e.fromX, fromY: e.fromY,
          toX: e.targets[i].x, toY: e.targets[i].y,
          curve: i % 2 === 0 ? 1 : -1,
          age: 0, lifetime: 18,
        });
      }
    });

    bus.on('vfx:critSplash', (e) => {
      this.pool.push({
        kind: 'ring', x: e.x, y: e.y,
        maxRadius: e.radiusPx, color: GEM_PALETTE.topaz.mid,
        age: 0, lifetime: 15,
      });
    });

    bus.on('vfx:bonusGold', (e) => {
      this.pool.push({ kind: 'coin', x: e.x, y: e.y, age: 0, lifetime: 24 });
    });

    bus.on('vfx:freezeProc', (e) => {
      this.pool.push({ kind: 'snowflake', x: e.x, y: e.y, age: 0, lifetime: 24 });
    });
  }

  render(layer: Container, state: State): void {
    if (!this.gfx) {
      this.gfx = new Graphics();
      layer.addChild(this.gfx);
    }
    this.gfx.clear();
    this.frame++;

    let write = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const fx = this.pool[i];
      fx.age++;
      if (fx.age >= fx.lifetime) continue;
      this.pool[write++] = fx;
      this.draw(fx);
    }
    this.pool.length = write;

    if (state.phase === 'wave') {
      this.drawFocusPips(state);
      this.tickAuraShimmer(state);
      this.tickCorrosion(state);
    }
  }

  clear(): void {
    this.pool.length = 0;
    if (this.gfx) this.gfx.clear();
  }

  private draw(fx: Fx): void {
    const g = this.gfx!;
    const t = fx.age / fx.lifetime;
    const alpha = 1 - t;

    switch (fx.kind) {
      case 'ring': {
        const r = fx.maxRadius * t;
        g.circle(fx.x, fx.y, r)
          .stroke({ width: 2, color: fx.color, alpha: alpha * 0.8 });
        break;
      }
      case 'snowburst': {
        for (const p of fx.particles) {
          p.y += p.vy;
          g.circle(p.x, p.y, 1.5).fill({ color: 0xffffff, alpha: alpha * 0.7 });
        }
        break;
      }
      case 'tendril': {
        const ext = Math.min(fx.age / (fx.lifetime * 0.4), 1);
        const fade = ext < 1 ? 1 : 1 - (fx.age - fx.lifetime * 0.4) / (fx.lifetime * 0.6);
        const ex = fx.fromX + (fx.toX - fx.fromX) * ext;
        const ey = fx.fromY + (fx.toY - fx.fromY) * ext;
        const dx = fx.toX - fx.fromX;
        const dy = fx.toY - fx.fromY;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const cpx = (fx.fromX + ex) / 2 + (dy / len) * 12 * fx.curve;
        const cpy = (fx.fromY + ey) / 2 - (dx / len) * 12 * fx.curve;
        g.moveTo(fx.fromX, fx.fromY)
          .quadraticCurveTo(cpx, cpy, ex, ey)
          .stroke({ width: 2, color: GEM_PALETTE.emerald.mid, alpha: fade * 0.8 });
        break;
      }
      case 'coin': {
        const rise = t * 20;
        const y = fx.y - rise;
        g.circle(fx.x, y, 4).fill({ color: 0xffd840, alpha });
        g.circle(fx.x, y, 4).stroke({ width: 1, color: 0xf0a040, alpha });
        g.circle(fx.x, y, 2).fill({ color: 0xffe880, alpha });
        break;
      }
      case 'snowflake': {
        const s = 0.6 + t * 0.4;
        const a = alpha * 0.9;
        const r = 5 * s;
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * Math.PI;
          const dx = Math.cos(ang) * r;
          const dy = Math.sin(ang) * r;
          g.moveTo(fx.x - dx, fx.y - dy)
            .lineTo(fx.x + dx, fx.y + dy)
            .stroke({ width: 1.5, color: 0xd0f4ff, alpha: a, pixelLine: true });
        }
        break;
      }
      case 'drift': {
        fx.x += fx.vx;
        fx.y += fx.vy;
        g.circle(fx.x, fx.y, fx.size).fill({ color: fx.color, alpha: alpha * 0.6 });
        break;
      }
    }
  }

  private drawFocusPips(state: State): void {
    const g = this.gfx!;
    for (const t of state.towers) {
      if (!t.focusTarget || t.focusTarget.stacks === 0) continue;
      const effects = resolveEffects(t);
      const fc = effects.find(
        (e): e is Extract<EffectKind, { kind: 'focus_crit' }> => e.kind === 'focus_crit',
      );
      if (!fc) continue;
      const max = Math.round(fc.maxBonus / fc.pctPerHit);
      const cur = t.focusTarget.stacks;
      const tx = (t.x + 1) * FINE_TILE;
      const ty = (t.y + 1) * FINE_TILE - FINE_TILE * 0.85;
      const gap = 8;
      const x0 = tx - ((max - 1) * gap) / 2;
      const ps = 3;
      for (let i = 0; i < max; i++) {
        const px = x0 + i * gap;
        const pts = [px, ty - ps, px + ps, ty, px, ty + ps, px - ps, ty];
        if (i < cur) {
          g.poly(pts).fill({ color: 0xd8f0f8, alpha: 0.9 });
        } else {
          g.poly(pts).stroke({ width: 1, color: 0xd8f0f8, alpha: 0.3, pixelLine: true });
        }
      }
    }
  }

  private tickAuraShimmer(state: State): void {
    if (this.frame % 20 !== 0) return;
    for (const t of state.towers) {
      if (!resolveEffects(t).some(e => e.kind === 'vulnerability_aura')) continue;
      const tx = (t.x + 1) * FINE_TILE;
      const ty = (t.y + 1) * FINE_TILE;
      const range = resolveRange(t) * TILE;
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * range;
      this.pool.push({
        kind: 'drift',
        x: tx + Math.cos(a) * d,
        y: ty + Math.sin(a) * d,
        vx: (Math.random() - 0.5) * 0.15,
        vy: 0.25 + Math.random() * 0.15,
        color: 0x7858a0, size: 2,
        age: 0, lifetime: 60,
      });
    }
  }

  private tickCorrosion(state: State): void {
    if (this.frame % 30 !== 0) return;
    for (const c of state.creeps) {
      if (!c.alive || !c.radiationArmor || c.radiationArmor < 1) continue;
      this.pool.push({
        kind: 'drift',
        x: c.px + (Math.random() - 0.5) * 8,
        y: c.py - 8,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.25 - Math.random() * 0.15,
        color: 0xa0d840, size: 1.5,
        age: 0, lifetime: 45,
      });
    }
  }
}

function resolveEffects(t: TowerState): EffectKind[] {
  if (t.comboKey) {
    const combo = COMBO_BY_NAME.get(t.comboKey);
    if (combo) return comboStatsAtTier(combo, t.upgradeTier ?? 0).effects;
  }
  return gemStats(t.gem, t.quality).effects;
}

function resolveRange(t: TowerState): number {
  if (t.comboKey) {
    const combo = COMBO_BY_NAME.get(t.comboKey);
    if (combo) return comboStatsAtTier(combo, t.upgradeTier ?? 0).range;
  }
  return gemStats(t.gem, t.quality).range;
}
