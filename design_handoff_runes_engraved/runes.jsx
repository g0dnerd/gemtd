/* runes.jsx
 *
 * Runes — a new tower type that does NOT block creep pathing.
 * Creeps walk OVER runes and trigger an effect.
 *
 * Visual constraints (the whole design problem):
 *   · Must NOT read as a gem tower. Gems stand up (lift, shadow, bob, halo)
 *     and live on a GRASS tile. Runes lie FLAT on the PATH tile.
 *   · Must read at a glance which effect each rune triggers — the player
 *     places them along the maze and needs to recognise them mid-wave.
 *   · Must look "inert" until a creep steps on it; the trigger flash is
 *     the moment of game feedback, so it has to land.
 *
 * Pixel codes per sprite:
 *   0 transparent · 1 stone-light · 2 stone-mid · 3 stone-dark
 *   4 outline     · 5 glow accent · 6 glyph hi
 */

const R_OUTLINE = '#0a0510';
const PATH_BASE = '#6b5230';
const PATH_HI   = '#8a6c44';
const PATH_LO   = '#4a3820';

/* ==== Rune effect palettes ============================================
 * Each effect gets a hue zone unclaimed by gems on the board.
 *   holding   = amber   (warm gold; reads "halt / hold")
 *   damage    = red     (jagged + warm; reads "harm")
 *   teleport  = violet  (mystic; reads "displace / portal")
 *   slow      = cyan    (cold; reads "frost / drag")
 * Stone shell colors are shared across all four runes so they read as a
 * SET first, effect second.
 */
const STONE = { light: '#cdb78a', mid: '#8a6e44', dark: '#3a2a1a' };

const RUNE_EFFECTS = {
  holding: {
    key: 'holding',
    name: 'Rune of Holding',
    short: 'HOLD',
    effect: 'Stuns the creep that steps on it.',
    glow: '#ffc54a',
    glyph: '#fff0a8',
    glyphDeep: '#a06818',
    triggerColor: '#ffe890',
    /* Glyph reads "anchor / pinned in place" — a vertical stake driven
     * into the disc with serifs top and bottom. Strong vertical mass. */
    glyph8: [
      [0,0,0,1,1,0,0,0],
      [0,1,1,1,1,1,1,0],
      [0,0,0,1,1,0,0,0],
      [0,0,0,1,1,0,0,0],
      [0,0,0,1,1,0,0,0],
      [0,0,0,1,1,0,0,0],
      [0,1,1,1,1,1,1,0],
      [0,0,0,1,1,0,0,0],
    ],
  },
  damage: {
    key: 'damage',
    name: 'Rune of Damage',
    short: 'DMG',
    effect: 'Damages the creep that steps on it.',
    glow: '#ff4838',
    glyph: '#ffd0a8',
    glyphDeep: '#7a1010',
    triggerColor: '#ffb070',
    /* Lightning bolt — jagged Z shape. Universal "damage / shock". */
    glyph8: [
      [0,0,0,0,1,1,1,0],
      [0,0,0,1,1,1,0,0],
      [0,0,1,1,1,0,0,0],
      [0,1,1,1,1,1,0,0],
      [0,0,1,1,1,1,1,0],
      [0,0,0,1,1,1,0,0],
      [0,0,1,1,1,0,0,0],
      [0,1,1,0,0,0,0,0],
    ],
  },
  teleport: {
    key: 'teleport',
    name: 'Rune of Teleportation',
    short: 'TELE',
    effect: 'Knocks the creep back along its path.',
    glow: '#b048f0',
    glyph: '#e8b8ff',
    glyphDeep: '#48107a',
    triggerColor: '#d890ff',
    /* Spiral — three-loop hooked curl reading as "vortex / portal". */
    glyph8: [
      [0,0,1,1,1,1,0,0],
      [0,1,0,0,0,0,1,0],
      [1,0,0,1,1,1,0,1],
      [1,0,1,0,0,1,0,1],
      [1,0,1,1,0,1,0,1],
      [1,0,0,0,0,1,0,0],
      [0,1,0,0,0,0,0,0],
      [0,0,1,1,1,1,1,0],
    ],
  },
  slow: {
    key: 'slow',
    name: 'Rune of Slow',
    short: 'SLOW',
    effect: 'Slows every creep that walks over it.',
    glow: '#48d0f0',
    glyph: '#d0f4ff',
    glyphDeep: '#104878',
    triggerColor: '#a8eaff',
    /* Six-armed snowflake / asterisk — reads as cold + radial slowdown. */
    glyph8: [
      [0,0,0,1,1,0,0,0],
      [1,0,1,1,1,1,0,1],
      [0,1,0,1,1,0,1,0],
      [1,1,1,1,1,1,1,1],
      [1,1,1,1,1,1,1,1],
      [0,1,0,1,1,0,1,0],
      [1,0,1,1,1,1,0,1],
      [0,0,0,1,1,0,0,0],
    ],
  },
};

const RUNE_LIST = [RUNE_EFFECTS.holding, RUNE_EFFECTS.damage, RUNE_EFFECTS.teleport, RUNE_EFFECTS.slow];

/* ==== Path-tile background ============================================
 * Mirrors the in-game path cell (#6b5230 base + lit/shadow inset) so we
 * can place runes on something that looks identical to the live game. */
function PathTile({ scale, size = 22, children, style }) {
  const px = size * scale;
  return (
    <div style={{
      position: 'relative',
      width: px,
      height: px,
      background: PATH_BASE,
      boxShadow: `
        inset ${scale}px ${scale}px 0 0 ${PATH_HI},
        inset -${scale}px -${scale}px 0 0 ${PATH_LO},
        0 0 0 ${scale}px ${R_OUTLINE}
      `,
      ...style,
    }}>
      {/* Subtle pebble grit so the path doesn't read as a flat block. */}
      <div style={{
        position: 'absolute',
        inset: scale,
        backgroundImage: `
          radial-gradient(circle at 22% 30%, #5a4626 0 ${scale}px, transparent ${scale}px),
          radial-gradient(circle at 70% 18%, #82643c 0 ${scale * 0.8}px, transparent ${scale * 0.8}px),
          radial-gradient(circle at 38% 78%, #5a4626 0 ${scale * 0.8}px, transparent ${scale * 0.8}px),
          radial-gradient(circle at 82% 70%, #82643c 0 ${scale}px, transparent ${scale}px)
        `,
        opacity: 0.6,
        pointerEvents: 'none',
      }} />
      {children}
    </div>
  );
}

/* ==== Pixel renderer for an arbitrary glyph grid ====================== */
function PixelLayer({ grid, color, scale, opacity = 1 }) {
  const w = grid[0].length;
  const h = grid.length;
  return (
    <div style={{ position: 'relative', width: w * scale, height: h * scale, opacity }}>
      {grid.flatMap((row, y) =>
        row.map((cell, x) => cell ? (
          <span key={`${x},${y}`} style={{
            position: 'absolute',
            left: x * scale,
            top: y * scale,
            width: scale,
            height: scale,
            background: color,
          }} />
        ) : null)
      )}
    </div>
  );
}

/* ==== Direction A — Engraved Stone Tablet =============================
 * A square stone paver inlaid into the path. Glyph carved into the stone
 * as a deep recess (dark) with a faint colored glow inside it. Reads as
 * "permanent inscription" — geological, ancient. */

// 14×14 stone-tablet base. 0=transparent, 1=light, 2=mid, 3=dark, 4=outline,
// G=glyph recess (effect color).
const TABLET_BASE = [
  [0,4,4,4,4,4,4,4,4,4,4,4,4,0],
  [4,3,1,1,2,2,2,2,2,2,1,1,3,4],
  [4,1,2,2,2,2,2,2,2,2,2,2,1,4],
  [4,1,2,3,3,3,3,3,3,3,3,2,1,4],
  [4,2,2,3,2,2,2,2,2,2,3,2,2,4],
  [4,2,2,3,2,0,0,0,0,2,3,2,2,4],
  [4,2,2,3,2,0,0,0,0,2,3,2,2,4],
  [4,2,2,3,2,0,0,0,0,2,3,2,2,4],
  [4,2,2,3,2,0,0,0,0,2,3,2,2,4],
  [4,2,2,3,2,2,2,2,2,2,3,2,2,4],
  [4,1,2,3,3,3,3,3,3,3,3,2,1,4],
  [4,1,2,2,2,2,2,2,2,2,2,2,1,4],
  [4,3,1,1,2,2,2,2,2,2,1,1,3,4],
  [0,4,4,4,4,4,4,4,4,4,4,4,4,0],
];

function StoneTablet({ effect, scale = 4, animated = true, triggered = false }) {
  const colorFor = (c) => {
    if (c === 1) return STONE.light;
    if (c === 2) return STONE.mid;
    if (c === 3) return STONE.dark;
    if (c === 4) return R_OUTLINE;
    return null;
  };
  return (
    <div style={{ position: 'relative', width: 14 * scale, height: 14 * scale }}>
      {TABLET_BASE.flatMap((row, y) =>
        row.map((cell, x) => {
          const c = colorFor(cell);
          if (!c) return null;
          return <span key={`${x},${y}`} style={{
            position: 'absolute',
            left: x * scale,
            top: y * scale,
            width: scale,
            height: scale,
            background: c,
          }} />;
        })
      )}
      {/* Glyph in carved recess */}
      <div style={{ position: 'absolute', left: 3 * scale, top: 3 * scale }}>
        <PixelLayer grid={effect.glyph8} color={effect.glow} scale={scale} opacity={triggered ? 1 : 0.85} />
      </div>
      {/* Animated subtle rune-glow inside the recess */}
      {animated && (
        <div style={{
          position: 'absolute',
          left: 3 * scale, top: 3 * scale,
          width: 8 * scale, height: 8 * scale,
          background: `radial-gradient(circle, ${effect.glow}66 0%, transparent 65%)`,
          mixBlendMode: 'screen',
          animation: 'rune-pulse 2.4s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}

/* ==== Direction B — Painted Magic Sigil ===============================
 * A chalky/ash sigil PAINTED on the path. No raised edge, no stone — just
 * a glowing colored circle with the glyph inside. Reads as "magic / ritual",
 * impermanent. Most visually loud at idle. */

function PaintedSigil({ effect, scale = 4, animated = true, triggered = false }) {
  const size = 14 * scale;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {/* Outer glyph ring (chalky stroke) */}
      <div style={{
        position: 'absolute', inset: scale,
        borderRadius: '50%',
        boxShadow: `
          inset 0 0 0 ${scale}px ${effect.glow},
          inset 0 0 0 ${scale * 1.5}px ${R_OUTLINE}
        `,
        opacity: 0.95,
      }} />
      {/* Inner ring */}
      <div style={{
        position: 'absolute', inset: scale * 3,
        borderRadius: '50%',
        boxShadow: `inset 0 0 0 ${Math.max(1, scale * 0.5)}px ${effect.glow}cc`,
        opacity: 0.8,
      }} />
      {/* Outer tick marks (4 cardinals) — ritual circle vibe */}
      {[0, 90, 180, 270].map((deg) => (
        <div key={deg} style={{
          position: 'absolute',
          left: '50%', top: '50%',
          width: scale, height: scale * 1.5,
          background: effect.glow,
          transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-${scale * 6}px)`,
          opacity: 0.9,
        }} />
      ))}
      {/* Glyph */}
      <div style={{
        position: 'absolute',
        left: '50%', top: '50%',
        transform: `translate(-${4 * scale}px, -${4 * scale}px)`,
      }}>
        <PixelLayer grid={effect.glyph8} color={effect.glyph} scale={scale} />
      </div>
      {/* Pulsing glow halo */}
      {animated && (
        <div style={{
          position: 'absolute', inset: -scale,
          background: `radial-gradient(circle, ${effect.glow}44 0%, transparent 60%)`,
          animation: 'rune-pulse 1.8s ease-in-out infinite',
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  );
}

/* ==== Direction C — Inlaid Crystal Disc (recommended) =================
 * A circular polished crystal disc inlaid flush into the path tile. Stone
 * bezel ring (matches the path stone family) + inner crystal field (effect
 * color, faceted shading) + etched glyph carved on top. Sits in the gem
 * visual family without standing up — it is a gem laid SIDEWAYS into the
 * ground, exactly the read we want. */

// 14×14 disc sprite. 0=transparent · 1=stone light · 2=stone mid ·
// 3=stone dark · 4=outline · 5=crystal light · 6=crystal mid · 7=crystal dark
const DISC_BASE = [
  [0,0,0,0,4,4,4,4,4,4,0,0,0,0],
  [0,0,4,4,1,2,2,2,2,2,4,4,0,0],
  [0,4,1,2,3,3,3,3,3,3,2,1,4,0],
  [0,4,2,3,5,5,6,6,6,6,3,2,1,4],
  [4,1,3,5,5,6,6,6,6,7,3,3,2,4],
  [4,2,3,5,6,6,6,6,7,7,7,3,2,4],
  [4,2,3,5,6,6,6,7,7,7,7,3,2,4],
  [4,2,3,6,6,6,7,7,7,7,7,3,2,4],
  [4,2,3,6,6,7,7,7,7,7,7,3,2,4],
  [4,2,3,3,7,7,7,7,7,7,3,3,2,4],
  [0,4,2,3,3,3,3,3,3,3,3,2,1,4],
  [0,4,1,2,3,3,3,3,3,3,2,1,4,0],
  [0,0,4,4,2,2,2,2,2,2,4,4,0,0],
  [0,0,0,0,4,4,4,4,4,4,0,0,0,0],
];

function shadeColor(hex, amt) {
  // amt is -1..1; positive lightens, negative darkens
  const m = hex.replace('#', '').match(/.{2}/g).map((s) => parseInt(s, 16));
  const adj = m.map((v) => {
    const t = amt < 0 ? 0 : 255;
    return Math.round(v + (t - v) * Math.abs(amt));
  });
  return '#' + adj.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function CrystalDisc({ effect, scale = 4, animated = true, triggered = false, showGlyph = true }) {
  const cLight = shadeColor(effect.glow, 0.55);
  const cMid = effect.glow;
  const cDark = shadeColor(effect.glow, -0.55);

  const colorFor = (c) => {
    if (c === 1) return STONE.light;
    if (c === 2) return STONE.mid;
    if (c === 3) return STONE.dark;
    if (c === 4) return R_OUTLINE;
    if (c === 5) return cLight;
    if (c === 6) return cMid;
    if (c === 7) return cDark;
    return null;
  };

  const size = 14 * scale;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {DISC_BASE.flatMap((row, y) =>
        row.map((cell, x) => {
          const c = colorFor(cell);
          if (!c) return null;
          return <span key={`${x},${y}`} style={{
            position: 'absolute',
            left: x * scale,
            top: y * scale,
            width: scale,
            height: scale,
            background: c,
          }} />;
        })
      )}

      {/* Etched glyph carved on top of the crystal — drawn in glyph hi-light. */}
      {showGlyph && (
        <div style={{
          position: 'absolute',
          left: 3 * scale, top: 3 * scale,
        }}>
          <PixelLayer grid={effect.glyph8} color={effect.glyph} scale={scale} opacity={0.95} />
          {/* Drop-shadow row: same glyph offset by 1px down/right in glyphDeep
              gives the carved/etched feel without doubling pixels. */}
          <div style={{ position: 'absolute', left: 0, top: 0, opacity: 0.45, filter: 'blur(0)' }}>
            <PixelLayer grid={effect.glyph8} color={effect.glyphDeep} scale={scale} />
          </div>
        </div>
      )}

      {/* Idle shimmer — single highlight pixel orbiting the disc rim. */}
      {animated && (
        <div style={{
          position: 'absolute', inset: 0,
          animation: 'rune-orbit 4.2s linear infinite',
          pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute',
            left: '50%', top: '12%',
            width: scale, height: scale,
            background: cLight,
            boxShadow: `0 0 ${scale * 2}px ${cLight}`,
            transform: 'translate(-50%, -50%)',
          }} />
        </div>
      )}

      {/* Subtle pulsing effect-color glow seeping out of the etched glyph. */}
      {animated && (
        <div style={{
          position: 'absolute',
          left: 3 * scale, top: 3 * scale,
          width: 8 * scale, height: 8 * scale,
          background: `radial-gradient(circle, ${effect.glow}aa 0%, transparent 65%)`,
          mixBlendMode: 'screen',
          animation: 'rune-pulse 2.6s ease-in-out infinite',
          pointerEvents: 'none',
          opacity: triggered ? 1 : 0.7,
        }} />
      )}
    </div>
  );
}

/* ==== Tile composer ===================================================
 * Drops a rune renderer onto a path tile, centered. */
function RuneOnTile({ effect, kind = 'disc', scale = 4, animated = true, triggered = false }) {
  const Renderer = kind === 'disc' ? CrystalDisc : kind === 'tablet' ? StoneTablet : PaintedSigil;
  return (
    <PathTile scale={scale} size={22}>
      <div style={{
        position: 'absolute',
        left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
      }}>
        <Renderer effect={effect} scale={scale} animated={animated} triggered={triggered} />
      </div>
    </PathTile>
  );
}

/* ==== Cards ============================================================ */

const cardStyle = {
  background: '#f5ede0',
  padding: 28,
  boxShadow: `0 0 0 4px ${R_OUTLINE}, inset 0 0 0 2px #d8c8b0`,
  fontFamily: "'VT323', monospace",
  color: '#1a1410',
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
};
const titleStyle = { fontFamily: "'Press Start 2P', monospace", fontSize: 14, margin: 0, letterSpacing: 1 };
const tagStyle = { fontFamily: "'VT323', monospace", fontSize: 16, color: '#5a4a3a', margin: '4px 0 0' };
const blurbStyle = { fontFamily: "'VT323', monospace", fontSize: 17, lineHeight: 1.3, color: '#2a2018', margin: '0 0 18px', maxWidth: 880 };
const labelStyle = { fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#1a1410', letterSpacing: 0.5 };
const subStyle = { fontFamily: "'VT323', monospace", fontSize: 14, color: '#5a4a3a', lineHeight: 1.1, textAlign: 'center', maxWidth: 110 };
const proHead = { fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: '#1a6a3a', marginBottom: 4 };
const conHead = { fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: '#8a3020', marginBottom: 4 };
const noteHead = { fontFamily: "'Press Start 2P', monospace", fontSize: 9, color: '#3a4a8a', marginBottom: 4 };

/* ---- Intro card -- frames the design problem ------------------------- */
function IntroCard() {
  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>Why runes need their own visual language</h2>
      <p style={tagStyle}>Walked-over, not built-into. Flat-on-path, not standing-up.</p>
      <p style={{ ...blurbStyle, marginTop: 14 }}>
        Gems are towers — they live on grass, raise off the ground, bob, cast a halo,
        and BLOCK the route. Runes are the inverse: they live on the path, lie flush,
        don't bob, and creeps walk straight over them. Whatever we paint, the silhouette
        has to telegraph "ground inscription" before the player parses the glyph.
      </p>
      <div style={{ display: 'flex', gap: 36, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <GemPlaceholder />
          <div style={labelStyle}>GEM (TOWER)</div>
          <div style={subStyle}>Stands up. Blocks. Bobs. Lives on grass.</div>
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', background: '#c8b894' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <RuneOnTile effect={RUNE_EFFECTS.holding} kind="disc" scale={5} />
          <div style={labelStyle}>RUNE</div>
          <div style={subStyle}>Lies flat. Walked over. Lives on path.</div>
        </div>
      </div>
    </div>
  );
}

function GemPlaceholder() {
  // A tiny faceted gem on grass — just enough for the comparison read.
  const scale = 5;
  const size = 22 * scale;
  return (
    <div style={{
      position: 'relative', width: size, height: size,
      background: '#3a5840',
      boxShadow: `inset ${scale}px ${scale}px 0 0 #4c7050, inset -${scale}px -${scale}px 0 0 #284028, 0 0 0 ${scale}px ${R_OUTLINE}`,
    }}>
      <div style={{
        position: 'absolute', left: '50%', top: '50%',
        transform: 'translate(-50%, -55%)',
        animation: 'gem-bob 2.4s ease-in-out infinite',
      }}>
        <div style={{
          width: scale * 9, height: scale * 9,
          background: 'linear-gradient(135deg, #ff6878 0%, #e8384c 50%, #8c1820 100%)',
          boxShadow: `0 0 0 ${scale}px ${R_OUTLINE}, 0 ${scale * 1.5}px 0 ${scale * 0.5}px #00000044`,
          transform: 'rotate(45deg)',
        }} />
      </div>
    </div>
  );
}

/* ---- Direction card -- shows all 4 runes in one treatment ----------- */
function DirectionCard({ id, name, tag, blurb, kind, pros, cons, recommended }) {
  return (
    <div style={{ ...cardStyle, position: 'relative' }}>
      {recommended && (
        <div style={{
          position: 'absolute', top: -2, right: -2,
          background: '#1a6a3a', color: '#f5ede0',
          padding: '6px 10px',
          fontFamily: "'Press Start 2P', monospace", fontSize: 8, letterSpacing: 1,
          boxShadow: `0 0 0 2px ${R_OUTLINE}`,
        }}>RECOMMENDED</div>
      )}
      <h2 style={titleStyle}>{name}</h2>
      <p style={tagStyle}>{tag}</p>
      <p style={{ ...blurbStyle, marginTop: 14 }}>{blurb}</p>

      <div style={{ display: 'flex', gap: 28, marginBottom: 22 }}>
        {RUNE_LIST.map((r) => (
          <div key={r.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <RuneOnTile effect={r} kind={kind} scale={4} />
            <div style={labelStyle}>{r.short}</div>
            <div style={subStyle}>{r.name.replace('Rune of ', '')}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 28 }}>
        <div style={{ flex: 1 }}>
          <div style={proHead}>+ PROS</div>
          {pros.map((p, i) => <div key={i} style={{ lineHeight: 1.25, fontSize: 15 }}>· {p}</div>)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={conHead}>− CONS</div>
          {cons.map((p, i) => <div key={i} style={{ lineHeight: 1.25, fontSize: 15 }}>· {p}</div>)}
        </div>
      </div>
    </div>
  );
}

/* ---- Detail card for the recommended direction ---------------------- */
function DetailCard() {
  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>Recommended · in detail</h2>
      <p style={tagStyle}>Inlaid Crystal Discs — full set, on tile, with trigger flash</p>
      <p style={{ ...blurbStyle, marginTop: 14 }}>
        Every rune is the same 14×14 silhouette: a stone bezel ring with a polished
        crystal pane sunk into the path, and the effect glyph etched on top. Only the
        crystal hue and the glyph change. This means the SET reads as "runes" first,
        and the EFFECT reads second — exactly the legibility hierarchy we want when
        five of these are scattered along a maze.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 24 }}>
        {RUNE_LIST.map((r) => (
          <div key={r.key} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            padding: 14,
            background: '#ece2cc',
            boxShadow: `inset 0 0 0 2px ${R_OUTLINE}`,
          }}>
            <RuneOnTile effect={r} kind="disc" scale={6} />
            <div style={labelStyle}>{r.name.toUpperCase()}</div>
            <div style={{ ...subStyle, maxWidth: 180, fontSize: 15 }}>{r.effect}</div>
            <ColorChip color={r.glow} label={`#${r.glow.replace('#', '').toUpperCase()}`} />
          </div>
        ))}
      </div>

      {/* Sprite-sheet view — clean 14×14 sprites at large scale, flat,
          with no path background. Useful for the artist to lift directly. */}
      <h3 style={{ ...titleStyle, fontSize: 11, marginTop: 14, marginBottom: 10 }}>Clean sprites · 14×14</h3>
      <div style={{ display: 'flex', gap: 18, marginBottom: 24, flexWrap: 'wrap' }}>
        {RUNE_LIST.map((r) => (
          <div key={r.key} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            padding: 12,
            background: `
              linear-gradient(45deg, #1a1428 25%, transparent 25%),
              linear-gradient(-45deg, #1a1428 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #1a1428 75%),
              linear-gradient(-45deg, transparent 75%, #1a1428 75%),
              #322945
            `,
            backgroundSize: '12px 12px',
            backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
            boxShadow: `0 0 0 2px ${R_OUTLINE}`,
          }}>
            <CrystalDisc effect={r} scale={5} animated={false} />
            <div style={{ ...subStyle, color: '#f5ede0' }}>{r.short}</div>
          </div>
        ))}
      </div>

      {/* Trigger sequence */}
      <h3 style={{ ...titleStyle, fontSize: 11, marginTop: 14, marginBottom: 10 }}>Trigger sequence (Hold rune, frame-by-frame)</h3>
      <p style={{ ...blurbStyle, marginTop: 0, marginBottom: 12 }}>
        When a creep steps on a rune, the etched glyph FLARES — disc colour saturates,
        a ring expands outward, and a quick pixel burst sells the effect. The flare
        is the same shape for every rune; only the color changes. Live demo loops
        every ~2.5s.
      </p>
      <TriggerLoop effect={RUNE_EFFECTS.holding} />

      <div style={{ height: 18 }} />
      <h3 style={{ ...titleStyle, fontSize: 11, marginBottom: 10 }}>All four · live trigger loop</h3>
      <div style={{ display: 'flex', gap: 28 }}>
        {RUNE_LIST.map((r, i) => (
          <div key={r.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <TriggerLoop effect={r} delaySec={i * 0.6} />
            <div style={labelStyle}>{r.short}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColorChip({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 14, height: 14, background: color, boxShadow: `0 0 0 1px ${R_OUTLINE}` }} />
      <div style={{ fontFamily: "'VT323', monospace", fontSize: 13, color: '#5a4a3a' }}>{label}</div>
    </div>
  );
}

/* TriggerLoop: cycles disc → flare → disc using CSS keyframes. */
function TriggerLoop({ effect, delaySec = 0 }) {
  const scale = 5;
  return (
    <div style={{ position: 'relative' }}>
      <PathTile scale={scale} size={22}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
          <CrystalDisc effect={effect} scale={scale} animated={true} />
        </div>
        {/* Expanding ring — fires once per cycle */}
        <div style={{
          position: 'absolute',
          left: '50%', top: '50%',
          width: scale * 12,
          height: scale * 12,
          transform: 'translate(-50%, -50%)',
          border: `${Math.max(2, scale * 0.6)}px solid ${effect.triggerColor}`,
          borderRadius: '50%',
          opacity: 0,
          animation: `rune-ring 2.5s ease-out ${delaySec}s infinite`,
          pointerEvents: 'none',
          mixBlendMode: 'screen',
        }} />
        {/* Pixel burst — eight square pixels flying outward in a starburst */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
          <div key={deg} style={{
            position: 'absolute',
            left: '50%', top: '50%',
            width: scale * 1.5,
            height: scale * 1.5,
            background: effect.triggerColor,
            transform: `translate(-50%, -50%) rotate(${deg}deg)`,
            opacity: 0,
            animation: `rune-burst-${i % 2 === 0 ? 'a' : 'b'} 2.5s ease-out ${delaySec}s infinite`,
            pointerEvents: 'none',
          }} />
        ))}
        {/* Bright flash overlay — disc whitens for 1 frame */}
        <div style={{
          position: 'absolute',
          left: '50%', top: '50%',
          width: scale * 14,
          height: scale * 14,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: effect.triggerColor,
          mixBlendMode: 'screen',
          opacity: 0,
          animation: `rune-flash 2.5s ease-out ${delaySec}s infinite`,
          pointerEvents: 'none',
        }} />
      </PathTile>
    </div>
  );
}

/* ---- Implementation/handoff notes ----------------------------------- */
function NotesCard() {
  return (
    <div style={cardStyle}>
      <h2 style={titleStyle}>Implementation notes</h2>
      <p style={{ ...blurbStyle, marginTop: 14 }}>
        Lifting these into the live engine should mean a small, well-bounded diff.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        <div>
          <div style={noteHead}>SPRITES</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 15, lineHeight: 1.35 }}>
            <li>Single 14×14 base disc sprite (DISC_BASE) with 7 colour codes — shared across all four runes.</li>
            <li>Per-effect 8×8 glyph grid (glyph8) drawn on top.</li>
            <li>Glyph drawn twice (offset 1px in glyphDeep) for an etched feel.</li>
          </ul>
        </div>
        <div>
          <div style={noteHead}>DATA</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 15, lineHeight: 1.35 }}>
            <li>RUNE_EFFECTS has the four entries with name, effect, glow, glyph, glyphDeep, triggerColor.</li>
            <li>Stone bezel palette is shared (STONE) so the bezel never drifts.</li>
            <li>No tier system — single-tier per the spec.</li>
          </ul>
        </div>
        <div>
          <div style={noteHead}>CELL TYPE</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 15, lineHeight: 1.35 }}>
            <li>New Cell.Rune — buildable on Path cells (unlike towers, which are placed on Grass).</li>
            <li>Pathfinding treats Rune cells as walkable; the placement validator does NOT call findRoute.</li>
            <li>State.runes[] tracks position + effect. Sim emits a CreepEnteredRune event handled by Combat.</li>
          </ul>
        </div>
        <div>
          <div style={noteHead}>TRIGGER FX</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 15, lineHeight: 1.35 }}>
            <li>One shared trigger animation: expanding ring + 8-direction pixel burst + 1-frame disc flash.</li>
            <li>Trigger color is a per-rune token (ffe890 / ffb070 / d890ff / a8eaff).</li>
            <li>Slow rune is the only one that may re-trigger continuously while creeps stand on it; all others fire once and go on cooldown for ~0.5s.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ==== Export ========================================================= */
Object.assign(window, {
  IntroCard,
  DirectionCard,
  DetailCard,
  NotesCard,
  RUNE_EFFECTS,
  RUNE_LIST,
});
