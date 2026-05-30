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

interface CoinRainParticle {
  x: number; y: number;
  vx: number; vy: number;
  spin: number; spinSpeed: number;
  delay: number;
  landed: boolean;
  bounced: boolean;
}

interface CoinRainFx {
  kind: 'coinRain';
  particles: CoinRainParticle[];
  landY: number;
  age: number; lifetime: number;
}

interface ChainPulseFx {
  kind: 'chainPulse';
  segments: Array<{
    fromX: number; fromY: number; toX: number; toY: number;
    fromId: number; toId: number;
  }>;
  age: number; lifetime: number;
}

type Fx = RingFx | SnowBurstFx | TendrilFx | SnowflakeFx | DriftFx | CoinRainFx | ChainPulseFx;

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
      const particles: CoinRainParticle[] = [];
      for (let i = 0; i < 20; i++) {
        particles.push({
          x: e.x + (Math.random() - 0.5) * 20,
          y: e.y - 20 - Math.random() * 16,
          vx: (Math.random() - 0.5) * 0.4,
          vy: 0.3 + Math.random() * 0.5,
          spin: Math.random() * Math.PI * 2,
          spinSpeed: 0.12 + Math.random() * 0.15,
          delay: Math.floor(Math.random() * 18),
          landed: false,
          bounced: false,
        });
      }
      this.pool.push({ kind: 'coinRain', particles, landY: e.y + 6, age: 0, lifetime: 90 });
    });

    bus.on('vfx:freezeProc', (e) => {
      this.pool.push({ kind: 'snowflake', x: e.x, y: e.y, age: 0, lifetime: 24 });
    });

    bus.on('vfx:eruption', (e) => {
      this.pool.push({
        kind: 'ring', x: e.x, y: e.y,
        maxRadius: e.radiusPx, color: 0xff5040,
        age: 0, lifetime: 22,
      });
      this.pool.push({
        kind: 'ring', x: e.x, y: e.y,
        maxRadius: e.radiusPx * 0.6, color: 0xffe060,
        age: 0, lifetime: 16,
      });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
        const speed = 1.2 + Math.random() * 1.8;
        this.pool.push({
          kind: 'drift',
          x: e.x, y: e.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 0.5,
          color: i % 3 === 0 ? 0xffe060 : 0xff5040,
          size: 1.5 + Math.random() * 1.5,
          age: 0, lifetime: 30 + Math.floor(Math.random() * 10),
        });
      }
    });

    bus.on('vfx:chainPulse', (e) => {
      const segments: ChainPulseFx['segments'] = [];
      for (let i = 0; i < e.points.length - 1; i++) {
        segments.push({
          fromX: e.points[i].x, fromY: e.points[i].y,
          toX: e.points[i + 1].x, toY: e.points[i + 1].y,
          fromId: e.points[i].id, toId: e.points[i + 1].id,
        });
      }
      const lifetime = segments.length * 6 + 14;
      this.pool.push({ kind: 'chainPulse', segments, age: 0, lifetime });
    });

    bus.on('vfx:groundImpact', (e) => {
      this.pool.push({
        kind: 'ring', x: e.x, y: e.y,
        maxRadius: e.radiusPx, color: 0xf0a040,
        age: 0, lifetime: 20,
      });
      this.pool.push({
        kind: 'ring', x: e.x, y: e.y,
        maxRadius: e.radiusPx * 0.5, color: 0xffe080,
        age: 0, lifetime: 14,
      });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.random() * 0.5;
        const speed = 0.6 + Math.random() * 1.0;
        this.pool.push({
          kind: 'drift',
          x: e.x, y: e.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 0.3,
          color: i % 2 === 0 ? 0xf0a040 : 0xd06848,
          size: 1.5 + Math.random(),
          age: 0, lifetime: 20 + Math.floor(Math.random() * 10),
        });
      }
    });

    bus.on('vfx:pierce', (e) => {
      this.pool.push({
        kind: 'ring', x: e.x, y: e.y,
        maxRadius: TILE * 0.6, color: 0xffffff,
        age: 0, lifetime: 10,
      });
      const perpX = -e.dirY;
      const perpY = e.dirX;
      for (let side = -1; side <= 1; side += 2) {
        this.pool.push({
          kind: 'drift',
          x: e.x, y: e.y,
          vx: perpX * side * 1.5,
          vy: perpY * side * 1.5,
          color: 0xe8c868,
          size: 2,
          age: 0, lifetime: 15,
        });
      }
    });

    bus.on('vfx:killExplode', (e) => {
      this.pool.push({
        kind: 'ring', x: e.x, y: e.y,
        maxRadius: e.radiusPx, color: 0x801020,
        age: 0, lifetime: 24,
      });
      this.pool.push({
        kind: 'ring', x: e.x, y: e.y,
        maxRadius: e.radiusPx * 0.6, color: 0xf0a040,
        age: 0, lifetime: 18,
      });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 1.0 + Math.random() * 1.5;
        this.pool.push({
          kind: 'drift',
          x: e.x, y: e.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed - 0.4,
          color: i % 3 === 0 ? 0xfff0d0 : (i % 3 === 1 ? 0xf0a040 : 0xe8c868),
          size: 1.5 + Math.random() * 1.5,
          age: 0, lifetime: 25 + Math.floor(Math.random() * 10),
        });
      }
    });

    bus.on('vfx:gestationTransition', (e) => {
      this.pool.push({
        kind: 'ring', x: e.x, y: e.y,
        maxRadius: TILE * 3, color: 0x1a0408,
        age: 0, lifetime: 30,
      });
      this.pool.push({
        kind: 'ring', x: e.x, y: e.y,
        maxRadius: TILE * 2, color: 0xe82030,
        age: 0, lifetime: 24,
      });
      this.pool.push({
        kind: 'ring', x: e.x, y: e.y,
        maxRadius: TILE * 1.2, color: 0xf8f0e0,
        age: 0, lifetime: 18,
      });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
        const speed = 1.5 + Math.random() * 2;
        this.pool.push({
          kind: 'drift',
          x: e.x, y: e.y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          color: i % 3 === 0 ? 0xc83040 : 0xe8dcd0,
          size: 2 + Math.random() * 2,
          age: 0, lifetime: 40,
        });
      }
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
      this.draw(fx, state);
    }
    this.pool.length = write;

    this.drawRunePips(state);

    this.tickJadeIdle(state);
    this.tickToxicMist(state);
    this.tickGoldIdle(state);
    this.tickUraniumThrob(state);
    this.tickBlackOpalTendrils(state);

    if (state.phase === 'wave') {
      this.drawFocusPips(state);
      this.drawMomentumPips(state);
      this.tickAfterburn(state);
      this.tickAuraShimmer(state);
      this.tickCorrosion(state);
    }
  }

  clear(): void {
    this.pool.length = 0;
    if (this.gfx) this.gfx.clear();
  }

  private draw(fx: Fx, state: State): void {
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
            .stroke({ width: 1.5, color: 0xd0f4ff, alpha: a });
        }
        break;
      }
      case 'drift': {
        fx.x += fx.vx;
        fx.y += fx.vy;
        g.circle(fx.x, fx.y, fx.size).fill({ color: fx.color, alpha: alpha * 0.6 });
        break;
      }
      case 'chainPulse': {
        const segFrames = 4;
        const fadeFrames = 8;
        const dotFlashFrames = 3;
        for (let i = 0; i < fx.segments.length; i++) {
          const seg = fx.segments[i];
          const fromCreep = state.creeps.find(c => c.id === seg.fromId);
          const toCreep = state.creeps.find(c => c.id === seg.toId);
          const fx0 = fromCreep?.alive ? fromCreep.px : seg.fromX;
          const fy0 = fromCreep?.alive ? fromCreep.py : seg.fromY;
          const tx0 = toCreep?.alive ? toCreep.px : seg.toX;
          const ty0 = toCreep?.alive ? toCreep.py : seg.toY;
          const segStart = i * segFrames;
          const segAge = fx.age - segStart;
          if (segAge < 0) continue;
          const ext = Math.min(segAge / segFrames, 1);
          const ex = fx0 + (tx0 - fx0) * ext;
          const ey = fy0 + (ty0 - fy0) * ext;
          const segFade = Math.max(0, 1 - Math.max(0, segAge - segFrames) / fadeFrames);
          g.moveTo(fx0, fy0).lineTo(ex, ey)
            .stroke({ width: 2, color: GEM_PALETTE.topaz.mid, alpha: segFade * 0.6 });
          if (ext >= 1) {
            const dotAge = segAge - segFrames;
            const dotAlpha = dotAge < dotFlashFrames ? 0.7 : segFade * 0.5;
            const dotRadius = dotAge < dotFlashFrames ? 3 : 2;
            const dotColor = dotAge < dotFlashFrames ? GEM_PALETTE.topaz.light : GEM_PALETTE.topaz.mid;
            g.circle(tx0, ty0, dotRadius)
              .fill({ color: dotColor, alpha: dotAlpha });
            if (dotAge < dotFlashFrames) {
              g.circle(tx0, ty0, 1)
                .fill({ color: 0xffffff, alpha: 0.6 * (1 - dotAge / dotFlashFrames) });
            }
          }
        }
        break;
      }
      case 'coinRain': {
        const gravity = 0.12;
        for (const p of fx.particles) {
          if (fx.age < p.delay) continue;
          if (!p.landed) {
            p.vy += gravity;
            p.x += p.vx;
            p.y += p.vy;
            p.spin += p.spinSpeed;
            if (p.y >= fx.landY) {
              p.y = fx.landY;
              if (!p.bounced) {
                p.vy = -1.2 - Math.random() * 0.6;
                p.vx *= 0.5;
                p.bounced = true;
              } else {
                p.landed = true;
                p.vy = 0;
                p.vx = 0;
              }
            }
          }
          const fadeStart = fx.lifetime * 0.7;
          const coinAlpha = fx.age > fadeStart ? 1 - (fx.age - fadeStart) / (fx.lifetime - fadeStart) : 1;
          const squash = Math.abs(Math.cos(p.spin));
          const rx = Math.max(0.5, 3.5 * squash);
          g.ellipse(p.x, p.y, rx, 3.5).fill({ color: 0xffd840, alpha: coinAlpha });
          g.ellipse(p.x, p.y, rx, 3.5).stroke({ width: 0.8, color: 0xf0a040, alpha: coinAlpha });
          g.ellipse(p.x, p.y, Math.max(0.3, 1.8 * squash), 1.8).fill({ color: 0xffe880, alpha: coinAlpha * 0.8 });
        }
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
          g.poly(pts).stroke({ width: 1, color: 0xd8f0f8, alpha: 0.3 });
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

  private drawRunePips(state: State): void {
    const g = this.gfx!;
    const now = performance.now() / 1000;
    for (const t of state.towers) {
      if (t.pressureStacks == null || t.pressureStacks === 0) continue;
      const effects = resolveEffects(t);
      const eruption = effects.find(
        (e): e is Extract<EffectKind, { kind: 'eruption' }> => e.kind === 'eruption',
      );
      if (!eruption) continue;
      const tx = (t.x + 1) * FINE_TILE;
      const ty = (t.y + 1) * FINE_TILE;
      const count = eruption.threshold;
      const filled = t.pressureStacks;
      const ratio = filled / count;
      const radius = FINE_TILE * 0.85;
      const ps = 3;
      const allFilled = filled >= count;
      const pulseAlpha = allFilled ? 0.7 + 0.3 * ((Math.sin(now * 6) + 1) / 2) : 1;

      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
        const px = tx + Math.cos(angle) * radius;
        const py = ty + Math.sin(angle) * radius;
        const pts = [px, py - ps, px + ps, py, px, py + ps, px - ps, py];
        if (i < filled) {
          const color = ratio > 0.7 ? 0xffe060 : 0xff5040;
          g.poly(pts).fill({ color, alpha: 0.9 * pulseAlpha });
        } else {
          g.poly(pts).stroke({ width: 1, color: 0xff5040, alpha: 0.3 });
        }
      }
    }
  }

  private drawMomentumPips(state: State): void {
    const g = this.gfx!;
    const now = performance.now() / 1000;
    for (const t of state.towers) {
      if (t.momentumStacks == null || t.momentumStacks === 0) continue;
      const effects = resolveEffects(t);
      const momentum = effects.find(
        (e): e is Extract<EffectKind, { kind: 'momentum' }> => e.kind === 'momentum',
      );
      if (!momentum) continue;
      const max = momentum.maxStacks;
      const cur = t.momentumStacks;
      const frac = cur / max;
      const tx = (t.x + 1) * FINE_TILE;
      const ty = (t.y + 1) * FINE_TILE - FINE_TILE * 0.85;
      const pipCount = Math.min(max, 8);
      const gap = 8;
      const x0 = tx - ((pipCount - 1) * gap) / 2;
      const ps = 3;
      const atMax = cur >= max;
      const pulseAlpha = atMax ? 0.7 + 0.3 * ((Math.sin(now * 6) + 1) / 2) : 1;
      const filledPips = Math.round((cur / max) * pipCount);

      for (let i = 0; i < pipCount; i++) {
        const px = x0 + i * gap;
        const pts = [px, ty - ps, px + ps, ty, px, ty + ps, px - ps, ty];
        if (i < filledPips) {
          const color = frac > 0.7 ? 0xfff0d0 : (frac > 0.4 ? 0xf0a040 : 0xe8c868);
          g.poly(pts).fill({ color, alpha: 0.9 * pulseAlpha });
        } else {
          g.poly(pts).stroke({ width: 1, color: 0xe8c868, alpha: 0.3 });
        }
      }

      if (atMax && this.frame % 20 === 0) {
        this.pool.push({
          kind: 'drift',
          x: tx + (Math.random() - 0.5) * pipCount * gap,
          y: ty,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.5 - Math.random() * 0.3,
          color: 0xfff0d0,
          size: 1,
          age: 0, lifetime: 15,
        });
      }
    }
  }

  private tickAfterburn(state: State): void {
    if (this.frame % 12 !== 0) return;
    for (const c of state.creeps) {
      if (!c.alive || !c.afterburn) continue;
      this.pool.push({
        kind: 'drift',
        x: c.px + (Math.random() - 0.5) * 6,
        y: c.py - 4,
        vx: (Math.random() - 0.5) * 0.2,
        vy: -0.4 - Math.random() * 0.3,
        color: Math.random() > 0.5 ? 0xff5040 : 0xffe060,
        size: 1 + Math.random(),
        age: 0, lifetime: 25,
      });
    }
  }

  private tickJadeIdle(state: State): void {
    for (const t of state.towers) {
      if (t.comboKey !== 'jade') continue;
      const tier = t.upgradeTier ?? 0;
      const tx = (t.x + 1) * FINE_TILE;
      const ty = (t.y + 1) * FINE_TILE;

      // T1: rare jade sparkle pops
      const sparkleInterval = tier >= 1 ? 25 : 45;
      if (this.frame % sparkleInterval === 0) {
        const count = tier >= 1 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          this.pool.push({
            kind: 'drift',
            x: tx + (Math.random() - 0.5) * 12,
            y: ty - 4,
            vx: (Math.random() - 0.5) * 0.3,
            vy: -0.5 - Math.random() * 0.4,
            color: Math.random() > 0.3 ? 0x58c898 : 0xc8f0d8,
            size: 1 + Math.random() * 0.8,
            age: 0, lifetime: 30 + Math.floor(Math.random() * 15),
          });
        }
      }

    }
  }

  private tickToxicMist(state: State): void {
    for (const t of state.towers) {
      if (t.comboKey !== 'dark_emerald') continue;
      const tier = t.upgradeTier ?? 0;
      if (tier < 1) continue;

      const tx = (t.x + 1) * FINE_TILE;
      const ty = (t.y + 1) * FINE_TILE;

      // Miasma: slow, wide, faint dark-green particles drifting around the tower
      const miasmaInterval = tier >= 2 ? 18 : 25;
      if (this.frame % miasmaInterval === 0) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 6 + Math.random() * 8;
        this.pool.push({
          kind: 'drift',
          x: tx + Math.cos(angle) * dist,
          y: ty + Math.sin(angle) * dist * 0.6,
          vx: Math.cos(angle) * 0.08,
          vy: -0.06 - Math.random() * 0.08,
          color: 0x1c8838,
          size: 2.5 + Math.random() * 1.5,
          age: 0, lifetime: 70 + Math.floor(Math.random() * 40),
        });
      }

      // Wisps: bright rising toxic fumes from the gem body
      const wispInterval = tier >= 2 ? 8 : 12;
      if (this.frame % wispInterval === 0) {
        this.pool.push({
          kind: 'drift',
          x: tx + (Math.random() - 0.5) * 14,
          y: ty + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.3,
          vy: -0.4 - Math.random() * 0.4,
          color: 0x88e8a0,
          size: 1.2 + Math.random() * 0.8,
          age: 0, lifetime: 35 + Math.floor(Math.random() * 20),
        });
      }
    }
  }

  private tickGoldIdle(state: State): void {
    const beatPeriod = 180;
    const beatFrame = this.frame % beatPeriod;

    for (const t of state.towers) {
      if (t.comboKey !== 'gold') continue;
      const tier = t.upgradeTier ?? 0;
      const tx = (t.x + 1) * FINE_TILE;
      const ty = (t.y + 1) * FINE_TILE;

      if (beatFrame === 0) {
        const count = 8;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
          const speed = 0.25 + Math.random() * 0.15;
          this.pool.push({
            kind: 'drift',
            x: tx + Math.cos(angle) * 2,
            y: ty + Math.sin(angle) * 2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: Math.random() > 0.5 ? 0xffd840 : 0xfff0a0,
            size: 1.0 + Math.random() * 0.8,
            age: 0, lifetime: 45 + Math.floor(Math.random() * 15),
          });
        }
      }

      if (tier >= 1 && beatFrame === 0) {
        this.pool.push({
          kind: 'ring', x: tx, y: ty,
          maxRadius: TILE * 0.7, color: 0xf0c038,
          age: 0, lifetime: 40,
        });
      }
      if (tier >= 1 && beatFrame === 10) {
        this.pool.push({
          kind: 'ring', x: tx, y: ty,
          maxRadius: TILE * 0.5, color: 0xffd840,
          age: 0, lifetime: 30,
        });
      }
    }
  }

  private tickUraniumThrob(state: State): void {
    for (const t of state.towers) {
      if (t.comboKey !== 'uranium') continue;
      const tier = t.upgradeTier ?? 0;
      if (tier < 1) continue;

      const tx = (t.x + 1) * FINE_TILE;
      const ty = (t.y + 1) * FINE_TILE;

      const interval = tier >= 2 ? 15 : 25;
      if (this.frame % interval === 0) {
        const count = tier >= 2 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.15 + Math.random() * 0.25;
          this.pool.push({
            kind: 'drift',
            x: tx + (Math.random() - 0.5) * 6,
            y: ty + (Math.random() - 0.5) * 6,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: Math.random() > 0.4 ? 0xc0ff60 : 0xffffa0,
            size: 1 + Math.random() * 0.8,
            age: 0, lifetime: 50 + Math.floor(Math.random() * 30),
          });
        }
      }
    }
  }

  private tickBlackOpalTendrils(state: State): void {
    for (const t of state.towers) {
      if (t.comboKey !== 'black_opal') continue;
      const tier = t.upgradeTier ?? 0;
      if (tier < 1) continue;

      const tx = (t.x + 1) * FINE_TILE;
      const ty = (t.y + 1) * FINE_TILE;

      const interval = 18;
      if (this.frame % interval === 0) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.12 + Math.random() * 0.18;
        this.pool.push({
          kind: 'drift',
          x: tx + (Math.random() - 0.5) * 8,
          y: ty + (Math.random() - 0.5) * 8,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: Math.random() > 0.5 ? 0x6040a0 : 0x4830c0,
          size: 2 + Math.random() * 1.5,
          age: 0, lifetime: 55 + Math.floor(Math.random() * 30),
        });
      }
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
