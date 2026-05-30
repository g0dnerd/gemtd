# New Gems — Phase 2: Specials & Recipe Reshuffle

## Current state (branch: `new_gems`)

### Phase 1 complete: 3 new basic gem types

| Gem | Identity | Key mechanic | Targeting |
|-----|----------|--------------|-----------|
| **Garnet** | Mortar/artillery | `groundTarget` — arcing projectile splashes at ground position; creeps can dodge | Ground only |
| **Spinel** | Sniper | `targetPriority: 'highest_hp'` — pure damage, no effects | All |
| **Carnelian** | Charged burst | `charge_burst` — first shot after idle deals up to 4× damage | All |

These are fully implemented: stats in `gems.ts`, combat mechanics in `Combat.ts`, parabolic arc rendering, AI support, palette/UI, tests passing.

### Phase 2 started: first new special (Pyrite) + R1 recipe reshuffle

**R1 guaranteed recipes** (BuildPhase.ts picks one randomly):
| Special | Ingredients (all Q1) | Identity |
|---------|---------------------|----------|
| Silver | sapphire + garnet + diamond | Splash + slow (unchanged mechanic, new ingredients) |
| Malachite | opal + emerald + topaz | Multi-target (unchanged mechanic, new ingredients) |
| Pyrite | carnelian + spinel + aquamarine | **NEW** — momentum tower |

**Star Ruby** (ruby Q2 + ruby Q1 + amethyst Q1) remains a lucky-draw option, not a guaranteed R1.

**Pyrite** — implemented and passing the R1 clear test:
- Base: 32-40 dmg, 1.0 atk/s, range 5.5. `momentum` effect: builds 12 stacks, ramping attack speed to 2.5× base. Resets when no targets in range (after 2× base cooldown grace period).
- T2 "Molten Pyrite" (100g): momentum also ramps damage (+80% at max). Higher base stats.
- T3 "Pyroclast" (280g): +100% dmg at max. Gains `pierce` (projectile hits 1 additional creep in line behind target) + `kill_explode` (kill triggers r=1.0 AoE at death position).
- `visualGem: "spinel"` (pink/magenta projectiles). Sprite: placeholder — needs design.

### New effect kinds added this session

| Effect | Used by | Behavior |
|--------|---------|----------|
| `charge_burst` | Carnelian (basic) | Multiplies damage based on idle time since last fire |
| `momentum` | Pyrite (combo) | Stacking attack speed (+ optional damage) ramp on sustained fire |
| `pierce` | Pyroclast (T3) | Projectile continues to next creep in line behind target |
| `kill_explode` | Pyroclast (T3) | AoE at death position when projectile kills |

### New TowerState fields
- `momentumStacks?: number` — current momentum count

### New ProjectileState fields
- `isGroundTarget?: boolean` — mortar splash at landing
- `arcHeight?: number` — parabolic rendering height
- `pierceCount?: number` — remaining pierce targets
- `killExplode?: { radius, falloff }` — AoE on kill

### VFX still needed
- `vfx:groundImpact` event is emitted (garnet mortar + Pyroclast kill_explode) but has **no visual handler** in VfxRenderer yet — needs a ring/burst effect.
- Pyrite has placeholder rendering infrastructure in EntityRenderer.ts (`PyriteFx` interface, `pyriteBobWrap`/`pyriteFx` on TowerEntry) but no animation logic yet.
- No momentum-state visual feedback on the tower (could add glow/pulse that intensifies with stacks).

---

## What's next: more specials + recipe reshuffle

### Design goal

The 3 new basic gems should appear as ingredients in BOTH new specials AND reshuffled existing specials — not just in Pyrite. This integrates them into the full crafting ecosystem rather than ghettoizing them.

### Existing specials and their current ingredients

| Special | Current inputs | Notes |
|---------|---------------|-------|
| Silver | sapphire:1 + garnet:1 + diamond:1 | Already uses garnet (new) |
| Malachite | opal:1 + emerald:1 + topaz:1 | Reshuffled (was aquamarine) |
| Star Ruby | ruby:2 + ruby:1 + amethyst:1 | Unchanged |
| Pyrite | carnelian:1 + spinel:1 + aquamarine:1 | **NEW** |
| Black Opal | opal:5 + diamond:4 + aquamarine:3 | |
| Dark Emerald | emerald:4 + emerald:3 + topaz:2 | |
| Gold | amethyst:5 + amethyst:4 + diamond:2 | |
| Jade | opal:3 + emerald:3 + sapphire:3 | |
| Pink Diamond | diamond:5 + topaz:3 + diamond:3 | |
| Yellow Sapphire | sapphire:4 + topaz:4 + sapphire:2 | |
| Bloodstone | ruby:5 + aquamarine:4 + amethyst:3 | |
| Red Crystal | ruby:4 + ruby:3 + diamond:3 | |
| Rose Quartz | amethyst:4 + sapphire:3 + ruby:3 | |
| Paraiba Tourmaline | aquamarine:5 + emerald:4 + topaz:3 | |
| Uranium | opal:4 + opal:3 + diamond:4 | |
| Stargem | special (perfect of each) | |

### Reshuffle opportunities

Existing recipes that could swap in garnet/spinel/carnelian without breaking thematic identity:
- **Bloodstone** (eruption/volcanic) — could swap aquamarine:4 → garnet:4 (mortar = volcanic artillery fits)
- **Red Crystal** (beam/focus) — could use spinel (precision) or carnelian (burst)
- **Pink Diamond** (crit/execute) — spinel (sniper) fits the precision-kill theme
- **Dark Emerald** (poison/plague) — could incorporate carnelian (timing fits periodic nature)

### New specials to design

The user wants to continue adding specials. Considerations:
- Each should use at least 1 new gem type as an ingredient (but CAN mix with old gems)
- Should fill unoccupied mechanical space (see existing niches above)
- Must pass the R1 clear test if it's a Q1-only recipe, OR be a mid/late-game recipe (Q2+ ingredients)
- Need name, stats (base + 2 upgrade tiers), `visualGem`, and eventually a sprite

### Unoccupied mechanical space for new specials
- Adaptive/modal tower (switches behavior based on context)
- Overkill carry (excess damage transfers)
- Vulnerability mark (debuffs target for all towers)
- Distance scaling (damage varies with range to target)
- Whittling (% max HP damage)
- Shield/barrier mechanic

---

## Files modified this session

| File | Changes |
|------|---------|
| `src/render/theme.ts` | GemType union (11 types), GEM_TYPES array, GEM_PALETTE (3 new entries) |
| `src/data/gems.ts` | EffectKind (+4 kinds), GemBase (+3 fields), GEM_BASE (3 gems), GemStats, gemStats(), scaleEffects(), effectSummary() |
| `src/data/combos.ts` | Pyrite recipe (base + 2 tiers), Silver/Malachite input reshuffle |
| `src/game/State.ts` | TowerState (+momentumStacks), ProjectileState (+4 fields) |
| `src/systems/Combat.ts` | ResolvedStats (+3 fields), effectiveStats(), pickTarget() priority, momentum/charge/pierce/kill_explode in fire loop + fire() + impact() |
| `src/controllers/BuildPhase.ts` | R1 recipe pool (3 options now) |
| `src/render/EntityRenderer.ts` | Parabolic arc Y-offset, PyriteFx interface + tower entry fields |
| `src/events/EventBus.ts` | +vfx:groundImpact event |
| `src/ui/Inspector.ts` | lbGemColors (3 gems), effectChiclet (4 new effects) |
| `src/sim/ai/GreedyAI.ts` | GEM_NAMES (3 entries) |
| `src/sim/ai/HeuristicAI.ts` | GEM_NAMES (3 entries), estimateComboDps (4 new effects) |
| `src/worker/dashboard.ts` | GEM_COLORS (3 entries), COMBO_TIER_NAMES (pyrite) |
| `tests/targeting.test.ts` | garnet added to ground-only set |
| `tests/combine.test.ts` | Silver ingredients updated |
| `tests/special-clear.test.ts` | Pyrite wave-1 clear tests added |
| `CLAUDE.md` | Documented in-progress state |

## Test status

All tests pass: `npm test` → 264 passed, 19 skipped. Typecheck clean.
