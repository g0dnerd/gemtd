export function handleDashboard(secret: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GemTD Telemetry</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<style>
  :root {
    --bg:             oklch(13% 0.012 260);
    --surface:        oklch(19% 0.014 255);
    --surface-raised: oklch(23% 0.014 255);
    --fg:             oklch(90% 0.005 250);
    --muted:          oklch(56% 0.010 250);
    --border:         oklch(26% 0.010 255);
    --accent:         oklch(76% 0.11 178);
    --accent-soft: color-mix(in oklch, var(--accent) 12%, transparent);
    --fg-soft:     color-mix(in oklch, var(--fg) 5%, transparent);
    --font-body: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, monospace;
    --radius: 8px;
    --radius-lg: 12px;
    --sidebar-w: 196px;
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  }
  *, *::before, *::after { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; font-family: var(--font-body); font-size: 14px; line-height: 1.5;
    color: var(--fg); background: var(--bg);
    display: flex; height: 100vh; overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }
  a { color: inherit; text-decoration: none; }
  button, select { font: inherit; cursor: pointer; }

  .sidebar {
    width: var(--sidebar-w); background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column; flex-shrink: 0;
  }
  .sidebar-brand {
    padding: 20px; font-size: 15px; font-weight: 700;
    letter-spacing: -0.02em; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; gap: 8px;
  }
  .sidebar-brand .gem {
    width: 8px; height: 8px; background: var(--accent);
    border-radius: 2px; transform: rotate(45deg);
  }
  .sidebar-nav { flex: 1; padding: 8px 0; }
  .sidebar-nav a {
    display: block; padding: 7px 20px; font-size: 13px;
    color: var(--muted); cursor: pointer;
    border-left: 2px solid transparent;
    transition: color 0.15s ease-out, background 0.15s ease-out, border-left-color 0.15s ease-out;
  }
  .sidebar-nav a:active { transform: scale(0.98); }
  @media (hover: hover) and (pointer: fine) {
    .sidebar-nav a:hover { color: var(--fg); background: var(--fg-soft); }
  }
  .sidebar-nav a.active {
    color: var(--accent); border-left-color: var(--accent);
    background: var(--accent-soft);
  }
  .sidebar-nav .nav-group {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em;
    color: color-mix(in oklch, var(--muted) 60%, transparent);
    padding: 16px 20px 4px;
  }
  .sidebar-footer {
    padding: 12px 20px; border-top: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 4px;
  }
  .sidebar-footer a {
    font-size: 12px; color: var(--muted); cursor: pointer; padding: 4px 0;
  }
  @media (hover: hover) and (pointer: fine) {
    .sidebar-footer a:hover { color: var(--accent); }
  }

  .main {
    flex: 1; display: flex; flex-direction: column;
    overflow: hidden; min-width: 0;
  }
  .topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 28px; border-bottom: 1px solid var(--border);
    background: var(--surface); flex-shrink: 0; gap: 16px;
  }
  .topbar-title {
    font-size: 15px; font-weight: 600;
    letter-spacing: -0.01em; white-space: nowrap;
  }
  .topbar-controls { display: flex; align-items: center; gap: 8px; }
  .topbar-controls select {
    background: var(--bg); color: var(--fg);
    border: 1px solid var(--border); border-radius: var(--radius);
    padding: 6px 10px; font-size: 13px; font-family: var(--font-mono);
  }
  .version-picker { display: flex; align-items: center; gap: 0; }
  .version-picker select:first-child {
    border-radius: var(--radius) 0 0 var(--radius);
    font-family: var(--font-body); font-size: 12px; font-weight: 500;
    color: var(--muted); padding: 6px 10px; min-width: 80px;
  }
  .version-picker select:last-child {
    border-radius: 0 var(--radius) var(--radius) 0; padding: 6px 10px;
  }
  .topbar-controls button {
    background: var(--accent-soft); color: var(--accent);
    border: 1px solid color-mix(in oklch, var(--accent) 25%, transparent);
    border-radius: var(--radius); padding: 6px 14px;
    font-size: 13px; font-weight: 500;
    transition: background 0.15s ease-out, border-color 0.15s ease-out, transform 0.16s ease-out;
  }
  .topbar-controls button:active { transform: scale(0.97); }
  @media (hover: hover) and (pointer: fine) {
    .topbar-controls button:hover {
      background: color-mix(in oklch, var(--accent) 20%, transparent);
    }
  }

  .content {
    flex: 1; overflow-y: auto; padding: 24px 28px 60px;
    scroll-behavior: smooth; scroll-padding-top: 12px;
  }

  .dash-section {
    margin-bottom: 44px; scroll-margin-top: 12px;
    opacity: 0; transform: translateY(6px);
    animation: sectionIn 0.3s var(--ease-out) forwards;
  }
  .dash-section:nth-child(1) { animation-delay: 0ms; }
  .dash-section:nth-child(2) { animation-delay: 40ms; }
  .dash-section:nth-child(3) { animation-delay: 80ms; }
  .dash-section:nth-child(4) { animation-delay: 120ms; }
  .dash-section:nth-child(5) { animation-delay: 160ms; }
  .dash-section:nth-child(6) { animation-delay: 200ms; }
  .dash-section:nth-child(7) { animation-delay: 240ms; }
  .dash-section:nth-child(8) { animation-delay: 280ms; }
  .dash-section:nth-child(9) { animation-delay: 320ms; }
  .dash-section:nth-child(10) { animation-delay: 360ms; }
  @keyframes sectionIn {
    to { opacity: 1; transform: translateY(0); }
  }
  .dash-section:last-child { margin-bottom: 0; }
  .section-header {
    display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
  }
  .section-header h2 {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: var(--muted);
    white-space: nowrap; margin: 0;
  }
  .section-header::after {
    content: ''; flex: 1; height: 1px; background: var(--border);
  }

  .kpi-row {
    display: grid; grid-template-columns: repeat(5, 1fr);
    gap: 12px; margin-bottom: 16px;
  }
  .kpi-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 14px 18px;
    opacity: 0; transform: translateY(4px);
    animation: sectionIn 0.25s var(--ease-out) forwards;
  }
  .kpi-card:nth-child(1) { animation-delay: 0ms; }
  .kpi-card:nth-child(2) { animation-delay: 30ms; }
  .kpi-card:nth-child(3) { animation-delay: 60ms; }
  .kpi-card:nth-child(4) { animation-delay: 90ms; }
  .kpi-card:nth-child(5) { animation-delay: 120ms; }
  .kpi-label {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--muted); margin-bottom: 2px;
  }
  .kpi-value {
    font-family: var(--font-mono); font-size: 26px; font-weight: 700;
    font-variant-numeric: tabular-nums; letter-spacing: -0.03em; line-height: 1.1;
  }
  .kpi-value.accent { color: var(--accent); }
  .kpi-sub {
    font-family: var(--font-mono); font-size: 11px;
    color: var(--muted); margin-top: 2px;
  }

  .chart-grid { display: grid; gap: 12px; }
  .chart-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .chart-panel {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: 18px 20px;
  }
  .chart-panel h3 {
    font-size: 12px; font-weight: 600; color: var(--muted);
    margin: 0 0 14px; letter-spacing: 0.01em;
  }
  .chart-wrap { position: relative; width: 100%; }

  .table-panel {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); overflow: hidden;
  }
  .table-panel-header {
    padding: 14px 18px; border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .table-panel-header h3 {
    font-size: 12px; font-weight: 600; color: var(--muted); margin: 0;
  }
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table th {
    text-align: left; padding: 8px 14px; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
    color: color-mix(in oklch, var(--muted) 80%, transparent);
    border-bottom: 1px solid var(--border);
    cursor: pointer; user-select: none; white-space: nowrap;
  }
  @media (hover: hover) and (pointer: fine) {
    .data-table th:hover { color: var(--fg); }
  }
  .data-table th .sort-arrow {
    opacity: 0.3; margin-left: 3px; font-size: 9px;
  }
  .data-table th.sorted .sort-arrow { opacity: 1; color: var(--accent); }
  .data-table td {
    padding: 7px 14px;
    border-bottom: 1px solid color-mix(in oklch, var(--border) 40%, transparent);
  }
  @media (hover: hover) and (pointer: fine) {
    .data-table tbody tr:hover td { background: var(--fg-soft); }
  }
  .data-table .num {
    font-family: var(--font-mono); font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .bar-cell { display: flex; align-items: center; gap: 8px; }
  .bar-cell .bar-value {
    font-family: var(--font-mono); font-variant-numeric: tabular-nums;
    font-size: 12px; min-width: 52px; text-align: right;
  }
  .bar-cell .bar-track {
    flex: 1; height: 4px;
    background: color-mix(in oklch, var(--border) 40%, transparent);
    border-radius: 2px; overflow: hidden; min-width: 60px;
  }
  .bar-cell .bar-fill {
    height: 100%; width: 100%; border-radius: 2px;
    transform-origin: left; transition: transform 0.3s var(--ease-out);
  }

  .quality-badge {
    display: inline-block; padding: 1px 6px; border-radius: 3px;
    font-size: 11px; font-weight: 600; font-family: var(--font-mono);
  }
  .q1 { background: color-mix(in oklch, oklch(65% 0.08 250) 20%, transparent); color: oklch(70% 0.08 250); }
  .q2 { background: color-mix(in oklch, oklch(70% 0.14 145) 20%, transparent); color: oklch(75% 0.14 145); }
  .q3 { background: color-mix(in oklch, oklch(72% 0.14 250) 20%, transparent); color: oklch(78% 0.14 250); }
  .q4 { background: color-mix(in oklch, oklch(72% 0.16 310) 20%, transparent); color: oklch(78% 0.16 310); }
  .q5 { background: color-mix(in oklch, oklch(80% 0.16 85) 20%, transparent); color: oklch(85% 0.16 85); }

  .kind-dot {
    display: inline-block; width: 8px; height: 8px;
    border-radius: 50%; margin-right: 6px; vertical-align: middle;
  }

  .pill {
    display: inline-flex; align-items: center; padding: 2px 8px;
    border-radius: 999px; font-family: var(--font-mono);
    font-size: 10px; letter-spacing: 0.03em; text-transform: uppercase;
  }
  .pill-accent { background: var(--accent-soft); color: var(--accent); }

  .loading-msg {
    color: var(--muted); padding: 60px 20px; text-align: center; font-size: 13px;
    transition: opacity 0.15s ease-out;
  }
  .loading-msg.fade-out { opacity: 0; }
  .error-msg {
    color: #f87171; padding: 16px 20px; font-size: 13px;
    background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.15);
    border-radius: var(--radius); margin: 20px 0;
  }

  .content::-webkit-scrollbar { width: 6px; }
  .content::-webkit-scrollbar-track { background: transparent; }
  .content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; transition: background 0.15s ease; }
  .content::-webkit-scrollbar-thumb:hover { background: var(--muted); }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-delay: 0ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
</head>
<body>
<aside class="sidebar">
  <div class="sidebar-brand"><span class="gem"></span>GemTD Telemetry</div>
  <nav class="sidebar-nav" id="sidebar-nav">
    <div class="nav-group">Dashboard</div>
    <a data-target="overview" class="active">Overview</a>
    <div class="nav-group">Analysis</div>
    <a data-target="difficulty">Difficulty Curve</a>
    <a data-target="pressure">Wave Pressure</a>
    <a data-target="waves">Wave Progression</a>
    <a data-target="creeps">Creep Balance</a>
    <a data-target="creep-breakdown">Creep Kind Breakdown</a>
    <div class="nav-group">Towers</div>
    <a data-target="combos">Combos</a>
    <a data-target="gems">Gem Effectiveness</a>
    <a data-target="gem-curves">Gem Damage Curves</a>
    <a data-target="keepers">Keeper Choices</a>
    <div class="nav-group">Economy</div>
    <a data-target="economy">Gold &amp; Chance</a>
  </nav>
  <div class="sidebar-footer">
    <a id="exp-runs">Export runs (CSV)</a>
    <a id="exp-towers">Export towers (CSV)</a>
    <a id="exp-events">Export events (CSV)</a>
    <a id="exp-wave_creep_stats">Export creep stats (CSV)</a>
    <a id="exp-wave_gem_damage">Export gem damage (CSV)</a>
  </div>
</aside>
<div class="main">
  <header class="topbar">
    <span class="topbar-title">Dashboard</span>
    <div class="topbar-controls">
      <select id="runset">
        <option value="real">Real</option>
        <option value="sim">Sim</option>
      </select>
      <div class="version-picker">
        <select id="vmode">
          <option value="exact">Exact</option>
          <option value="minor">Minor</option>
          <option value="since">Since</option>
        </select>
        <select id="version"><option value="">All</option></select>
      </div>
      <button onclick="load()">Refresh</button>
    </div>
  </header>
  <div class="content" id="content">
    <p class="loading-msg">Loading&hellip;</p>
  </div>
</div>
<script>
const SECRET = ${JSON.stringify(secret)};
const base = '/api';

const C = {
  teal: '#5eead4', tealSoft: 'rgba(94,234,212,0.12)',
  blue: '#7dd3fc', blueSoft: 'rgba(125,211,252,0.12)',
  amber: '#fbbf24', amberSoft: 'rgba(251,191,36,0.12)',
  coral: '#fb923c', coralSoft: 'rgba(251,146,60,0.12)',
  red: '#f87171', redSoft: 'rgba(248,113,113,0.12)',
  violet: '#c084fc', violetSoft: 'rgba(192,132,252,0.12)',
  green: '#4ade80', greenSoft: 'rgba(74,222,128,0.12)',
  rose: '#fb7185', roseSoft: 'rgba(251,113,133,0.12)',
  muted: '#7a8494',
  grid: 'rgba(255,255,255,0.06)',
  gridLabel: '#6a7585',
};

const GEM_COLORS = {
  ruby: '#f87171', sapphire: '#60a5fa', emerald: '#4ade80',
  topaz: '#fbbf24', amethyst: '#c084fc', opal: '#e2e8f0',
  diamond: '#f0f9ff', aquamarine: '#5eead4',
  garnet: '#d06848', spinel: '#f080c0', carnelian: '#e89060',
};

const COMBO_TIER_NAMES = {
  star_ruby: ['Star Ruby', 'Plasma Star', 'Solar Core'],
  yellow_sapphire: ['Yellow Sapphire', 'Blizzard Sapphire'],
  black_opal: ['Black Opal', 'Void Opal'],
  dark_emerald: ['Dark Emerald', 'Venomous Emerald'],
  pink_diamond: ['Pink Diamond', 'Living Diamond'],
  jade: ['Jade', 'Asian Jade', 'Lucky Asian Jade'],
  malachite: ['Malachite', 'Vivid Malachite', 'Mighty Malachite'],
  silver: ['Silver', 'Frosted Silver', 'Silver Knight'],
  bloodstone: ['Bloodstone', 'Ancient Bloodstone'],
  gold: ['Gold', "Pharaoh's Gold"],
  red_crystal: ['Red Crystal', 'Red Crystal Facet', 'Rose Quartz Crystal'],
  paraiba_tourmaline: ['Paraiba Tourmaline', 'Ancient Paraiba'],
  uranium: ['Uranium', 'Uranium 235'],
  stargem: ['Stargem'],
};

const AXIS_OPTS = {
  grid: { color: C.grid, drawBorder: false },
  ticks: { color: C.gridLabel, font: { size: 10, family: "ui-monospace, 'SF Mono', monospace" }, padding: 6 },
};
const WAVE_X = { ...AXIS_OPTS, title: { display: true, text: 'Wave', color: C.gridLabel, font: { size: 10 } } };
const PCT_Y = { ...AXIS_OPTS, min: 0, max: 1, ticks: { ...AXIS_OPTS.ticks, callback: v => (v * 100).toFixed(0) + '%' } };
const BOTTOM_LEGEND = { display: true, position: 'bottom', labels: { boxWidth: 10, font: { size: 10 }, color: C.gridLabel } };

const creepColors = {
  amalgam: C.red, carapace: C.violet, shrike: C.blue, skitter: C.amber,
  mender: C.green, vessel: C.coral, wizard: '#a78bfa', burrower: C.teal,
  shambler: C.muted, gazer: C.rose, coral: '#38bdf8', anemone: '#2dd4bf',
  chrysalid: '#c084fc', mycoid: '#86efac', gestation: '#94a3b8',
};

Chart.defaults.color = C.gridLabel;
Chart.defaults.borderColor = C.grid;
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.plugins.legend.display = false;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15,20,35,0.92)';
Chart.defaults.plugins.tooltip.titleFont = { size: 12, weight: '600' };
Chart.defaults.plugins.tooltip.bodyFont = { size: 11 };
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 6;
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255,255,255,0.08)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.elements.point.radius = 0;
Chart.defaults.elements.point.hoverRadius = 4;
Chart.defaults.elements.line.tension = 0.3;
Chart.defaults.elements.line.borderWidth = 2;
Chart.defaults.animation = { duration: 150 };

let allVersions = [];
let activeCharts = [];
let initialLoad = true;

function qs(params) {
  return '?' + new URLSearchParams({ secret: SECRET, ...params }).toString();
}
function fmt(n, d) { return n == null ? '\\u2014' : Number(n).toFixed(d ?? 0); }
function pct(n) { return n == null ? '\\u2014' : (Number(n) * 100).toFixed(1) + '%'; }
function fmtN(n) { return Number(n).toLocaleString(); }
function fmtTime(ticks) {
  if (ticks == null) return '\\u2014';
  const secs = Math.round(Number(ticks) / 60);
  return Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function formatComboName(key) { return key.split('_').map(capitalize).join(' '); }
function comboDisplayName(key, tier) {
  const names = COMBO_TIER_NAMES[key];
  if (!names) return formatComboName(key);
  return names[Math.min(tier, names.length - 1)];
}
function semverCmp(a, b) {
  const stripPre = (v) => v.replace(/-.*$/, '');
  const pa = stripPre(a).split('.').map(Number);
  const pb = stripPre(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  const preA = a.includes('-') ? 1 : 0;
  const preB = b.includes('-') ? 1 : 0;
  if (preA !== preB) return preA - preB;
  return 0;
}

function addOpt(sel, value, text, selected) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = text;
  if (value === selected) opt.selected = true;
  sel.appendChild(opt);
}

function populateVersions(versions, selected) {
  const mode = document.getElementById('vmode').value;
  const sel = document.getElementById('version');
  const cur = selected || sel.value;
  sel.innerHTML = '<option value="">All</option>';

  const sorted = [...versions].sort((a, b) => semverCmp(b, a));

  if (mode === 'exact') {
    for (const v of sorted) addOpt(sel, v, 'v' + v, cur);
  } else if (mode === 'minor') {
    const seen = new Set();
    for (const v of sorted) {
      const parts = v.split('.');
      const key = parts[0] + '.' + parts[1] + '.x';
      if (seen.has(key)) continue;
      seen.add(key);
      addOpt(sel, key, 'v' + key, cur);
    }
  } else if (mode === 'since') {
    for (const v of sorted) addOpt(sel, v, '\\u2265 v' + v, cur);
  }
}

function versionParams(params) {
  const mode = document.getElementById('vmode').value;
  const v = document.getElementById('version').value;
  if (!v) return;
  if (mode === 'exact') {
    params.version = v;
  } else if (mode === 'minor') {
    const prefix = v.slice(0, -1);
    const matching = allVersions.filter(ver => ver.startsWith(prefix));
    if (matching.length && matching.length < allVersions.length) {
      params.versions = matching.join(',');
    }
  } else if (mode === 'since') {
    const matching = allVersions.filter(ver => semverCmp(ver, v) >= 0);
    if (matching.length && matching.length < allVersions.length) {
      params.versions = matching.join(',');
    }
  }
}

function runsetParams(params) {
  const rs = document.getElementById('runset');
  if (rs) params.runset = rs.value;
}

function updateExportLinks() {
  const params = { secret: SECRET, format: 'csv' };
  versionParams(params);
  runsetParams(params);
  ['runs', 'towers', 'events', 'wave_creep_stats', 'wave_gem_damage'].forEach(ds => {
    const el = document.getElementById('exp-' + ds);
    if (el) el.href = base + '/export' + qs({ ...params, dataset: ds });
  });
}

function kpiCard(label, value, accent, sub) {
  return '<div class="kpi-card"><div class="kpi-label">' + label + '</div>' +
    '<div class="kpi-value' + (accent ? ' accent' : '') + '">' + value + '</div>' +
    (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + '</div>';
}

function render(data) {
  const el = document.getElementById('content');
  const o = data.overview || {};
  const total = Number(o.total_runs) || 0;
  const wins = Number(o.wins) || 0;
  const winRate = total > 0 ? (wins / total * 100).toFixed(1) + '%' : '\\u2014';
  const avgWave = Number(o.avg_wave);

  let h = '';

  // Overview
  h += '<section class="dash-section" id="overview"><div class="section-header"><h2>Overview</h2></div>';
  h += '<div class="kpi-row">';
  h += kpiCard('Total Runs', fmtN(total), false);
  h += kpiCard('Win Rate', winRate, true, wins + ' wins');
  h += kpiCard('Avg Wave', isNaN(avgWave) ? '\\u2014' : avgWave.toFixed(1), false, 'of 50');
  h += kpiCard('Avg Kills', fmtN(Math.round(Number(o.avg_kills) || 0)), false);
  h += kpiCard('Avg Duration', fmtTime(o.avg_duration_ticks), false);
  h += '</div></section>';

  // Difficulty
  h += '<section class="dash-section" id="difficulty"><div class="section-header"><h2>Difficulty Curve</h2></div>';
  h += '<div class="chart-grid cols-2">';
  h += '<div class="chart-panel"><h3>Survival Curve</h3><div class="chart-wrap"><canvas id="chart-survival"></canvas></div></div>';
  h += '<div class="chart-panel"><h3>Deaths by Wave</h3><div class="chart-wrap"><canvas id="chart-deaths"></canvas></div></div>';
  h += '</div></section>';

  // Wave Pressure
  h += '<section class="dash-section" id="pressure"><div class="section-header"><h2>Wave Pressure</h2></div>';
  h += '<div class="chart-grid cols-2">';
  h += '<div class="chart-panel"><h3>Avg Path Progress at Death</h3><div class="chart-wrap"><canvas id="chart-path-progress"></canvas></div></div>';
  h += '<div class="chart-panel"><h3>Avg Ticks to Kill</h3><div class="chart-wrap"><canvas id="chart-ticks-to-kill"></canvas></div></div>';
  h += '</div></section>';

  // Wave Progression
  h += '<section class="dash-section" id="waves"><div class="section-header"><h2>Wave Progression</h2></div>';
  h += '<div class="chart-grid cols-2">';
  h += '<div class="chart-panel"><h3>Avg Leaks per Wave</h3><div class="chart-wrap"><canvas id="chart-leaks"></canvas></div></div>';
  h += '<div class="chart-panel"><h3>Lives Remaining</h3><div class="chart-wrap"><canvas id="chart-lives"></canvas></div></div>';
  h += '<div class="chart-panel"><h3>Wave Damage Output</h3><div class="chart-wrap"><canvas id="chart-damage"></canvas></div></div>';
  h += '<div class="chart-panel"><h3>Gold Economy</h3><div class="chart-wrap"><canvas id="chart-gold"></canvas></div></div>';
  h += '</div></section>';

  // Creep Balance
  h += '<section class="dash-section" id="creeps"><div class="section-header"><h2>Creep Balance</h2></div>';
  h += '<div class="chart-grid cols-2">';
  h += '<div class="chart-panel" style="grid-column:1/-1"><h3>Lives Lost by Creep Type</h3><div class="chart-wrap"><canvas id="chart-creep-danger"></canvas></div></div>';
  h += '</div></section>';

  // Creep Kind Breakdown
  h += '<section class="dash-section" id="creep-breakdown"><div class="section-header"><h2>Creep Kind Breakdown</h2></div>';
  h += '<div class="chart-grid cols-2">';
  h += '<div class="chart-panel"><h3>Avg Path Progress by Creep Kind</h3><div class="chart-wrap"><canvas id="chart-kind-progress"></canvas></div></div>';
  h += '<div class="chart-panel"><h3>Leaks by Creep Kind per Wave</h3><div class="chart-wrap"><canvas id="chart-kind-leaks"></canvas></div></div>';
  h += '</div>';
  h += '<div class="table-panel" style="margin-top:12px"><div class="table-panel-header"><h3>Creep kind aggregate stats</h3><span class="pill pill-accent">Sortable</span></div>';
  h += '<table class="data-table" id="table-creep-kinds"><thead><tr>';
  h += '<th>Kind</th><th class="num">Spawned</th><th class="num">Killed</th><th class="num">Leaked</th><th class="num">Leak Rate</th><th class="num">Avg Progress</th><th class="num">Avg TTK</th>';
  h += '</tr></thead><tbody></tbody></table></div></section>';

  // Combos
  h += '<section class="dash-section" id="combos"><div class="section-header"><h2>Combo Effectiveness</h2></div>';
  h += '<div class="table-panel"><div class="table-panel-header"><h3>Damage output by combo and tier</h3><span class="pill pill-accent">Sortable</span></div>';
  h += '<table class="data-table" id="table-combos"><thead><tr>';
  h += '<th>Combo</th><th class="num">Count</th><th class="num">Avg Dmg/Wave</th><th>Avg Total Dmg</th><th class="num">Avg Wave Built</th><th class="num">Wave Impact</th><th class="num">Avg Share</th><th class="num">Dmg/HP</th>';
  h += '</tr></thead><tbody></tbody></table></div></section>';

  // Gems
  h += '<section class="dash-section" id="gems"><div class="section-header"><h2>Gem Effectiveness</h2></div>';
  h += '<div class="table-panel"><div class="table-panel-header"><h3>Tower damage by gem type and quality</h3><span class="pill pill-accent">Sortable</span></div>';
  h += '<table class="data-table" id="table-gems"><thead><tr>';
  h += '<th>Gem</th><th>Quality</th><th class="num">Count</th><th class="num">Avg Dmg/Wave</th><th>Avg Total Dmg</th><th class="num">Avg Share</th>';
  h += '</tr></thead><tbody></tbody></table></div></section>';

  // Gem Damage Curves
  h += '<section class="dash-section" id="gem-curves"><div class="section-header"><h2>Gem Damage Curves</h2></div>';
  h += '<div class="chart-grid cols-2">';
  h += '<div class="chart-panel"><h3>Damage Share by Gem Type</h3><div class="chart-wrap"><canvas id="chart-gem-share"></canvas></div></div>';
  h += '<div class="chart-panel"><h3>Combo vs Base Gem Damage</h3><div class="chart-wrap"><canvas id="chart-combo-share"></canvas></div></div>';
  h += '</div>';
  h += '<div class="table-panel" style="margin-top:12px"><div class="table-panel-header"><h3>Gem damage by game phase</h3><span class="pill pill-accent">Sortable</span></div>';
  h += '<table class="data-table" id="table-gem-phase"><thead><tr>';
  h += '<th>Gem</th><th>Type</th><th class="num">Early (1\\u201315)</th><th class="num">Mid (16\\u201330)</th><th class="num">Late (31+)</th><th class="num">Total</th><th class="num">Avg Share</th><th class="num">Dmg/HP</th>';
  h += '</tr></thead><tbody></tbody></table></div></section>';

  // Keepers
  h += '<section class="dash-section" id="keepers"><div class="section-header"><h2>Keeper Choices</h2></div>';
  h += '<div class="chart-grid cols-2">';
  h += '<div class="chart-panel"><h3>Keeper Distribution by Gem</h3><div class="chart-wrap"><canvas id="chart-keeper-dist"></canvas></div></div>';
  h += '<div class="chart-panel"><h3>Avg Keeper Quality by Wave</h3><div class="chart-wrap"><canvas id="chart-keeper-quality"></canvas></div></div>';
  h += '</div>';
  h += '<div class="table-panel" style="margin-top:12px"><div class="table-panel-header"><h3>Keeper choice detail</h3></div>';
  h += '<table class="data-table" id="table-keepers"><thead><tr>';
  h += '<th>Gem</th><th class="num">Times Kept</th><th class="num">Avg Quality</th><th class="num">Avg Wave</th>';
  h += '</tr></thead><tbody></tbody></table></div></section>';

  // Economy
  h += '<section class="dash-section" id="economy"><div class="section-header"><h2>Gold &amp; Chance Tiers</h2></div>';
  h += '<div class="table-panel"><div class="table-panel-header"><h3>Chance tier upgrade timing</h3></div>';
  h += '<table class="data-table" id="table-chance"><thead><tr>';
  h += '<th>Tier</th><th class="num">Avg Wave</th><th class="num">Avg Gold</th><th class="num">Count</th>';
  h += '</tr></thead><tbody></tbody></table></div></section>';

  el.innerHTML = h;
  createCharts(data, total);

  renderComboTable(data.combos || [], avgWave, data.comboDamageByWave || [], data.gemDamageByWave || [], data.waveHpPool || []);
  renderGemTable(data.gemDps || []);
  renderCreepKindTable(data.creepKindSummary || []);
  renderGemPhaseTable(data.gemDamageByWave || [], data.waveHpPool || []);
  renderKeeperTable(data.keeperChoices || []);
  renderChanceTable(data.chanceTiming || []);
  makeSortable();
}

function createCharts(data, total) {
  // Survival
  if (data.survivalCurve && data.survivalCurve.length) {
    activeCharts.push(new Chart(document.getElementById('chart-survival'), {
      type: 'line',
      data: {
        labels: data.survivalCurve.map(r => r.wave),
        datasets: [{
          data: data.survivalCurve.map(r => Number(r.runs)),
          borderColor: C.teal, backgroundColor: C.tealSoft,
          fill: true, pointHoverBackgroundColor: C.teal,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2,
        scales: {
          x: { ...AXIS_OPTS, title: { display: true, text: 'Wave', color: C.gridLabel, font: { size: 10 } } },
          y: { ...AXIS_OPTS, beginAtZero: true, title: { display: true, text: 'Runs Reaching', color: C.gridLabel, font: { size: 10 } } },
        },
        plugins: { tooltip: { callbacks: {
          title: ctx => 'Wave ' + ctx[0].label,
          label: ctx => ctx.parsed.y + ' runs (' + (total > 0 ? (ctx.parsed.y / total * 100).toFixed(1) : '0') + '%)',
        }}},
      },
    }));
  }

  // Deaths by wave
  if (data.deathsByWave && data.deathsByWave.length) {
    const canvas = document.getElementById('chart-deaths');
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.parentElement.offsetHeight || 200);
    grad.addColorStop(0, 'rgba(248,113,113,0.85)');
    grad.addColorStop(1, 'rgba(248,113,113,0.35)');
    activeCharts.push(new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.deathsByWave.map(r => r.wave),
        datasets: [{
          data: data.deathsByWave.map(r => Number(r.deaths)),
          backgroundColor: grad, borderWidth: 0, borderRadius: 2,
          hoverBackgroundColor: C.red,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2,
        scales: {
          x: { ...AXIS_OPTS, title: { display: true, text: 'Wave', color: C.gridLabel, font: { size: 10 } } },
          y: { ...AXIS_OPTS, beginAtZero: true, title: { display: true, text: 'Deaths', color: C.gridLabel, font: { size: 10 } } },
        },
        plugins: { tooltip: { callbacks: {
          title: ctx => 'Wave ' + ctx[0].label,
          label: ctx => ctx.parsed.y + ' runs ended here',
        }}},
      },
    }));
  }

  // Wave pressure — path progress (with board state overlay)
  if (data.wavePressure && data.wavePressure.length) {
    activeCharts.push(new Chart(document.getElementById('chart-path-progress'), {
      type: 'line',
      data: {
        labels: data.wavePressure.map(r => r.wave),
        datasets: [{
          label: 'Avg Progress',
          data: data.wavePressure.map(r => Number(r.avg_path_progress)),
          borderColor: C.coral, backgroundColor: C.coralSoft,
          fill: true, pointHoverBackgroundColor: C.coral,
        }, {
          label: 'Max Kill Progress',
          data: data.wavePressure.map(r => Number(r.avg_max_path_progress)),
          borderColor: C.red, backgroundColor: 'transparent',
          borderDash: [4, 3], pointHoverBackgroundColor: C.red,
        }, {
          label: 'Avg Tower Quality',
          data: data.wavePressure.map(r => r.avg_quality != null ? Number(r.avg_quality) / 5 : null),
          borderColor: C.green, backgroundColor: 'transparent',
          borderDash: [2, 4], borderWidth: 1.5,
          pointRadius: 0, pointHoverRadius: 3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2,
        scales: {
          x: { ...AXIS_OPTS, title: { display: true, text: 'Wave', color: C.gridLabel, font: { size: 10 } } },
          y: { ...AXIS_OPTS, min: 0, max: 1, title: { display: true, text: 'Path Progress (0\\u20131)', color: C.gridLabel, font: { size: 10 } },
            ticks: { ...AXIS_OPTS.ticks, callback: v => (v * 100).toFixed(0) + '%' } },
        },
        plugins: {
          legend: { display: true, labels: { boxWidth: 12, font: { size: 10 }, color: C.gridLabel } },
          tooltip: { callbacks: {
            title: ctx => 'Wave ' + ctx[0].label,
            label: ctx => ctx.dataset.label + ': ' + (ctx.parsed.y * 100).toFixed(1) + '%',
          }},
        },
      },
    }));

    activeCharts.push(new Chart(document.getElementById('chart-ticks-to-kill'), {
      type: 'line',
      data: {
        labels: data.wavePressure.map(r => r.wave),
        datasets: [{
          data: data.wavePressure.map(r => Number(r.avg_ticks_to_kill)),
          borderColor: C.blue, backgroundColor: C.blueSoft,
          fill: true, pointHoverBackgroundColor: C.blue,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2,
        scales: {
          x: { ...AXIS_OPTS, title: { display: true, text: 'Wave', color: C.gridLabel, font: { size: 10 } } },
          y: { ...AXIS_OPTS, beginAtZero: true, title: { display: true, text: 'Ticks (60 = 1s)', color: C.gridLabel, font: { size: 10 } } },
        },
        plugins: { tooltip: { callbacks: {
          title: ctx => 'Wave ' + ctx[0].label,
          label: ctx => Math.round(ctx.parsed.y) + ' ticks (' + (ctx.parsed.y / 60).toFixed(1) + 's)',
        }}},
      },
    }));
  }

  // Leaks per wave (with path progress overlay)
  if (data.leaksPerWave && data.leaksPerWave.length) {
    const pressureByWave = {};
    if (data.wavePressure) data.wavePressure.forEach(r => { pressureByWave[r.wave] = r; });
    const canvas = document.getElementById('chart-leaks');
    const ctx2 = canvas.getContext('2d');
    const grad = ctx2.createLinearGradient(0, 0, 0, canvas.parentElement.offsetHeight || 200);
    grad.addColorStop(0, 'rgba(251,191,36,0.85)');
    grad.addColorStop(1, 'rgba(251,191,36,0.35)');
    activeCharts.push(new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.leaksPerWave.map(r => r.wave),
        datasets: [{
          label: 'Avg Leaks',
          data: data.leaksPerWave.map(r => Number(r.avg_leaks)),
          backgroundColor: grad, borderWidth: 0, borderRadius: 2,
          yAxisID: 'y',
        }, {
          type: 'line', label: 'Avg Path Progress',
          data: data.leaksPerWave.map(r => {
            const p = pressureByWave[r.wave];
            return p ? Number(p.avg_path_progress) : null;
          }),
          borderColor: C.coral, backgroundColor: 'transparent',
          borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3,
          yAxisID: 'y1',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2,
        scales: {
          x: { ...AXIS_OPTS },
          y: { ...AXIS_OPTS, beginAtZero: true, position: 'left', title: { display: true, text: 'Avg Leaks', color: C.gridLabel, font: { size: 10 } } },
          y1: { ...AXIS_OPTS, min: 0, max: 1, position: 'right', grid: { drawOnChartArea: false },
            title: { display: true, text: 'Path Progress', color: C.gridLabel, font: { size: 10 } },
            ticks: { ...AXIS_OPTS.ticks, callback: v => (v * 100).toFixed(0) + '%' } },
        },
        plugins: {
          legend: { display: true, labels: { boxWidth: 10, font: { size: 10 }, color: C.gridLabel } },
          tooltip: { callbacks: {
            label: ctx => {
              if (ctx.datasetIndex === 1) return 'Path: ' + (ctx.parsed.y * 100).toFixed(1) + '%';
              return ctx.parsed.y.toFixed(2) + ' leaks';
            },
          }},
        },
      },
    }));

    // Lives remaining
    activeCharts.push(new Chart(document.getElementById('chart-lives'), {
      type: 'line',
      data: {
        labels: data.leaksPerWave.map(r => r.wave),
        datasets: [{
          data: data.leaksPerWave.map(r => Number(r.avg_lives)),
          borderColor: C.coral, backgroundColor: C.coralSoft,
          fill: true, pointHoverBackgroundColor: C.coral,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2,
        scales: { x: { ...AXIS_OPTS }, y: { ...AXIS_OPTS, beginAtZero: true } },
        plugins: { tooltip: { callbacks: { label: ctx => ctx.parsed.y.toFixed(1) + ' lives' } } },
      },
    }));

    // Gold economy
    activeCharts.push(new Chart(document.getElementById('chart-gold'), {
      type: 'line',
      data: {
        labels: data.leaksPerWave.map(r => r.wave),
        datasets: [{
          data: data.leaksPerWave.map(r => Number(r.avg_gold)),
          borderColor: C.amber, backgroundColor: C.amberSoft,
          fill: true, pointHoverBackgroundColor: C.amber,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2,
        scales: { x: { ...AXIS_OPTS }, y: { ...AXIS_OPTS, beginAtZero: true } },
      },
    }));
  }

  // Wave damage
  if (data.waveDamage && data.waveDamage.length) {
    activeCharts.push(new Chart(document.getElementById('chart-damage'), {
      type: 'line',
      data: {
        labels: data.waveDamage.map(r => r.wave),
        datasets: [{
          data: data.waveDamage.map(r => Number(r.avg_damage)),
          borderColor: C.blue, backgroundColor: C.blueSoft,
          fill: true, pointHoverBackgroundColor: C.blue,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2,
        scales: {
          x: { ...AXIS_OPTS },
          y: { ...AXIS_OPTS, beginAtZero: true, ticks: { ...AXIS_OPTS.ticks, callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v } },
        },
      },
    }));
  }

  // Creep danger
  if (data.leaksByKind && data.leaksByKind.length) {
    const sorted = [...data.leaksByKind].sort((a, b) => Number(b.total_lives_lost) - Number(a.total_lives_lost));
    activeCharts.push(new Chart(document.getElementById('chart-creep-danger'), {
      type: 'bar',
      data: {
        labels: sorted.map(r => r.creep_kind),
        datasets: [{
          data: sorted.map(r => Number(r.total_lives_lost)),
          backgroundColor: sorted.map(r => (creepColors[r.creep_kind] || C.muted) + '99'),
          hoverBackgroundColor: sorted.map(r => creepColors[r.creep_kind] || C.muted),
          borderWidth: 0, borderRadius: 3,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: true, aspectRatio: 2.5,
        scales: {
          x: { ...AXIS_OPTS, beginAtZero: true, title: { display: true, text: 'Total Lives Lost', color: C.gridLabel, font: { size: 10 } } },
          y: { ...AXIS_OPTS, ticks: { ...AXIS_OPTS.ticks, font: { size: 11, weight: '500' } } },
        },
        plugins: { tooltip: { callbacks: {
          label: ctx => {
            const r = sorted[ctx.dataIndex];
            return Number(r.total_lives_lost) + ' lives lost \\u00B7 ' + r.leak_count + ' leaks \\u00B7 ' + Number(r.avg_lives_per_leak).toFixed(1) + ' avg cost';
          },
        }}},
      },
    }));
  }

  // Creep kind breakdown
  if (data.creepKindProgress && data.creepKindProgress.length) {
    const byKind = {};
    const allWaves = new Set();
    data.creepKindProgress.forEach(r => {
      allWaves.add(r.wave);
      if (!byKind[r.creep_kind]) byKind[r.creep_kind] = {};
      byKind[r.creep_kind][r.wave] = r;
    });
    const waves = [...allWaves].sort((a, b) => a - b);
    const kinds = Object.keys(byKind).sort();

    activeCharts.push(new Chart(document.getElementById('chart-kind-progress'), {
      type: 'line',
      data: {
        labels: waves,
        datasets: kinds.map(kind => ({
          label: capitalize(kind),
          data: waves.map(w => byKind[kind][w] ? Number(byKind[kind][w].avg_progress) : null),
          borderColor: creepColors[kind] || C.muted,
          backgroundColor: 'transparent',
          spanGaps: true,
          pointHoverBackgroundColor: creepColors[kind] || C.muted,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2,
        scales: {
          x: WAVE_X,
          y: { ...PCT_Y, title: { display: true, text: 'Avg Path Progress', color: C.gridLabel, font: { size: 10 } } },
        },
        plugins: {
          legend: BOTTOM_LEGEND,
          tooltip: { callbacks: {
            title: ctx => 'Wave ' + ctx[0].label,
            label: ctx => ctx.dataset.label + ': ' + (ctx.parsed.y * 100).toFixed(1) + '%',
          }},
        },
      },
    }));

    activeCharts.push(new Chart(document.getElementById('chart-kind-leaks'), {
      type: 'bar',
      data: {
        labels: waves,
        datasets: kinds.map(kind => ({
          label: capitalize(kind),
          data: waves.map(w => byKind[kind][w] ? Number(byKind[kind][w].total_leaks) : 0),
          backgroundColor: (creepColors[kind] || C.muted) + '99',
          hoverBackgroundColor: creepColors[kind] || C.muted,
          borderWidth: 0, borderRadius: 1,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2,
        scales: {
          x: { ...AXIS_OPTS, stacked: true },
          y: { ...AXIS_OPTS, stacked: true, beginAtZero: true,
            title: { display: true, text: 'Total Leaks', color: C.gridLabel, font: { size: 10 } } },
        },
        plugins: { legend: BOTTOM_LEGEND },
      },
    }));
  }

  // Gem damage curves
  if (data.gemDamageByWave && data.gemDamageByWave.length) {
    const byWave = {};
    const allGems = new Set();
    data.gemDamageByWave.forEach(r => {
      const w = r.wave;
      if (!byWave[w]) byWave[w] = { total: 0, gems: {}, combo: 0, base: 0 };
      const gem = r.gem;
      allGems.add(gem);
      const dmg = Number(r.total_damage);
      byWave[w].gems[gem] = (byWave[w].gems[gem] || 0) + dmg;
      byWave[w].total += dmg;
      if (Number(r.is_combo)) byWave[w].combo += dmg;
      else byWave[w].base += dmg;
    });
    const waves = Object.keys(byWave).map(Number).sort((a, b) => a - b);
    const gems = [...allGems].sort();

    activeCharts.push(new Chart(document.getElementById('chart-gem-share'), {
      type: 'line',
      data: {
        labels: waves,
        datasets: gems.map(gem => ({
          label: capitalize(gem),
          data: waves.map(w => byWave[w].total > 0 ? (byWave[w].gems[gem] || 0) / byWave[w].total : 0),
          backgroundColor: (GEM_COLORS[gem] || C.muted) + '44',
          borderColor: GEM_COLORS[gem] || C.muted,
          borderWidth: 1.5, fill: true,
          pointRadius: 0, pointHoverRadius: 3,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2,
        scales: { x: WAVE_X, y: { ...PCT_Y, stacked: true } },
        plugins: {
          legend: BOTTOM_LEGEND,
          tooltip: { callbacks: {
            title: ctx => 'Wave ' + ctx[0].label,
            label: ctx => ctx.dataset.label + ': ' + (ctx.parsed.y * 100).toFixed(1) + '%',
          }},
        },
      },
    }));

    activeCharts.push(new Chart(document.getElementById('chart-combo-share'), {
      type: 'line',
      data: {
        labels: waves,
        datasets: [{
          label: 'Combo Towers',
          data: waves.map(w => {
            const t = byWave[w].combo + byWave[w].base;
            return t > 0 ? byWave[w].combo / t : 0;
          }),
          borderColor: C.teal, backgroundColor: C.tealSoft,
          fill: true,
        }, {
          label: 'Base Gems',
          data: waves.map(w => {
            const t = byWave[w].combo + byWave[w].base;
            return t > 0 ? byWave[w].base / t : 0;
          }),
          borderColor: C.amber, backgroundColor: C.amberSoft,
          fill: true,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2,
        scales: { x: WAVE_X, y: { ...PCT_Y, stacked: true } },
        plugins: { legend: BOTTOM_LEGEND },
      },
    }));
  }

  // Keeper distribution
  if (data.keeperChoices && data.keeperChoices.length) {
    activeCharts.push(new Chart(document.getElementById('chart-keeper-dist'), {
      type: 'bar',
      data: {
        labels: data.keeperChoices.map(r => capitalize(r.gem)),
        datasets: [{
          data: data.keeperChoices.map(r => Number(r.count)),
          backgroundColor: data.keeperChoices.map(r => (GEM_COLORS[r.gem] || C.muted) + '99'),
          hoverBackgroundColor: data.keeperChoices.map(r => GEM_COLORS[r.gem] || C.muted),
          borderWidth: 0, borderRadius: 3,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: true, aspectRatio: 1.8,
        scales: {
          x: { ...AXIS_OPTS, beginAtZero: true },
          y: { ...AXIS_OPTS, ticks: { ...AXIS_OPTS.ticks, font: { size: 11, weight: '500' } } },
        },
        plugins: { tooltip: { callbacks: {
          label: ctx => {
            const r = data.keeperChoices[ctx.dataIndex];
            return Number(r.count) + ' times \\u00B7 avg quality ' + Number(r.avg_quality).toFixed(1) + ' \\u00B7 avg wave ' + Number(r.avg_wave).toFixed(1);
          },
        }}},
      },
    }));
  }

  // Keeper quality curve
  if (data.keeperCurve && data.keeperCurve.length) {
    activeCharts.push(new Chart(document.getElementById('chart-keeper-quality'), {
      type: 'line',
      data: {
        labels: data.keeperCurve.map(r => r.wave),
        datasets: [{
          data: data.keeperCurve.map(r => Number(r.avg_keeper_quality)),
          borderColor: C.violet, backgroundColor: C.violetSoft,
          fill: true, pointHoverBackgroundColor: C.violet,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 1.8,
        scales: {
          x: { ...AXIS_OPTS, title: { display: true, text: 'Wave', color: C.gridLabel, font: { size: 10 } } },
          y: { ...AXIS_OPTS, min: 1, max: 5, title: { display: true, text: 'Avg Quality', color: C.gridLabel, font: { size: 10 } } },
        },
      },
    }));
  }
}

function renderComboTable(combos, globalAvgWave, comboDmgByWave, allGemDmgByWave, hpPoolRows) {
  const tbody = document.querySelector('#table-combos tbody');
  if (!tbody || !combos.length) return;

  const hpByWave = {};
  (hpPoolRows || []).forEach(r => { hpByWave[r.wave] = Number(r.avg_hp_pool); });

  const waveTotals = {};
  (allGemDmgByWave || []).forEach(r => { waveTotals[Number(r.wave)] = (waveTotals[Number(r.wave)] || 0) + Number(r.total_damage); });

  const comboWaves = {};
  (comboDmgByWave || []).forEach(r => {
    const ck = r.combo_key + ':' + (Number(r.upgrade_tier) || 0);
    if (!comboWaves[ck]) comboWaves[ck] = [];
    comboWaves[ck].push({ wave: Number(r.wave), damage: Number(r.total_damage), runs: Number(r.runs) });
  });

  const comboNorm = {};
  Object.entries(comboWaves).forEach(([ck, waves]) => {
    let shareSum = 0, shareN = 0, normSum = 0, normN = 0;
    waves.forEach(wd => {
      const wt = waveTotals[wd.wave];
      if (wt > 0) { shareSum += wd.damage / wt; shareN++; }
      const hp = hpByWave[wd.wave];
      if (hp > 0 && wd.runs > 0) { normSum += (wd.damage / wd.runs) / hp; normN++; }
    });
    comboNorm[ck] = {
      avgShare: shareN > 0 ? shareSum / shareN : 0,
      avgNorm: normN > 0 ? normSum / normN : 0,
    };
  });

  const maxDmg = Math.max(...combos.map(r => Number(r.avg_damage)));
  tbody.innerHTML = combos.map(r => {
    const tier = Number(r.tier) || 0;
    const name = comboDisplayName(r.combo_key, tier);
    const p = maxDmg > 0 ? (Number(r.avg_damage) / maxDmg) : 0;
    const badge = tier > 0
      ? ' <span class="quality-badge q' + Math.min(tier + 1, 5) + '" style="font-size:9px;margin-left:6px">\\u2605' + tier + '</span>'
      : '';
    const comboWave = Number(r.avg_wave_reached);
    const delta = !isNaN(comboWave) && !isNaN(globalAvgWave) ? comboWave - globalAvgWave : NaN;
    const deltaStr = isNaN(delta) ? '\\u2014'
      : (delta >= 0 ? '+' : '') + delta.toFixed(1);
    const deltaColor = isNaN(delta) ? '' : delta >= 0 ? 'color:' + C.green : 'color:' + C.red;
    const sn = comboNorm[r.combo_key + ':' + tier];
    const shareStr = sn ? (sn.avgShare * 100).toFixed(1) + '%' : '\\u2014';
    const normStr = sn ? (sn.avgNorm * 100).toFixed(1) + '%' : '\\u2014';
    return '<tr><td style="font-weight:500">' + name + badge + '</td>' +
      '<td class="num">' + r.count + '</td>' +
      '<td class="num">' + fmtN(Math.round(Number(r.avg_dmg_per_wave))) + '</td>' +
      '<td><div class="bar-cell"><span class="bar-value">' + fmtN(Math.round(Number(r.avg_damage))) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="transform:scaleX(' + p.toFixed(3) + ');background:' + C.teal + '"></span></span></div></td>' +
      '<td class="num">' + Number(r.avg_wave_built).toFixed(1) + '</td>' +
      '<td class="num" style="' + deltaColor + ';font-weight:600">' + deltaStr + '</td>' +
      '<td class="num">' + shareStr + '</td>' +
      '<td class="num">' + normStr + '</td></tr>';
  }).join('');
}

function renderGemTable(gems) {
  const tbody = document.querySelector('#table-gems tbody');
  if (!tbody || !gems.length) return;
  const maxDmg = Math.max(...gems.map(r => Number(r.avg_damage)));
  const qNames = { 1: 'Chipped', 2: 'Flawed', 3: 'Normal', 4: 'Flawless', 5: 'Perfect' };
  tbody.innerHTML = gems.map(r => {
    const p = maxDmg > 0 ? (Number(r.avg_damage) / maxDmg) : 0;
    const share = Number(r.avg_damage_share);
    return '<tr><td><span class="kind-dot" style="background:' + (GEM_COLORS[r.gem] || C.muted) + '"></span>' + capitalize(r.gem) + '</td>' +
      '<td data-sort="' + r.quality + '"><span class="quality-badge q' + r.quality + '">' + (qNames[r.quality] || r.quality) + '</span></td>' +
      '<td class="num">' + r.count + '</td>' +
      '<td class="num">' + fmtN(Math.round(Number(r.avg_dmg_per_wave))) + '</td>' +
      '<td><div class="bar-cell"><span class="bar-value">' + fmtN(Math.round(Number(r.avg_damage))) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="transform:scaleX(' + p.toFixed(3) + ');background:' + (GEM_COLORS[r.gem] || C.teal) + '"></span></span></div></td>' +
      '<td class="num">' + (isNaN(share) ? '\\u2014' : (share * 100).toFixed(1) + '%') + '</td></tr>';
  }).join('');
}

function renderCreepKindTable(kinds) {
  const tbody = document.querySelector('#table-creep-kinds tbody');
  if (!tbody || !kinds.length) return;
  tbody.innerHTML = kinds.map(r => {
    const spawned = Number(r.total_spawned);
    const leaks = Number(r.total_leaks);
    const leakRate = spawned > 0 ? (leaks / spawned * 100).toFixed(1) + '%' : '\\u2014';
    return '<tr>' +
      '<td><span class="kind-dot" style="background:' + (creepColors[r.creep_kind] || C.muted) + '"></span>' + capitalize(r.creep_kind) + '</td>' +
      '<td class="num">' + fmtN(spawned) + '</td>' +
      '<td class="num">' + fmtN(Number(r.total_kills)) + '</td>' +
      '<td class="num">' + fmtN(leaks) + '</td>' +
      '<td class="num">' + leakRate + '</td>' +
      '<td class="num">' + (Number(r.avg_progress) * 100).toFixed(1) + '%</td>' +
      '<td class="num">' + Math.round(Number(r.avg_ticks)) + '</td></tr>';
  }).join('');
}

function renderGemPhaseTable(rows, hpPoolRows) {
  const tbody = document.querySelector('#table-gem-phase tbody');
  if (!tbody || !rows.length) return;

  const hpByWave = {};
  (hpPoolRows || []).forEach(r => { hpByWave[r.wave] = Number(r.avg_hp_pool); });

  const waveTotals = {};
  rows.forEach(r => { waveTotals[Number(r.wave)] = (waveTotals[Number(r.wave)] || 0) + Number(r.total_damage); });

  const phases = {};
  rows.forEach(r => {
    const gem = r.gem;
    const isCombo = Number(r.is_combo);
    const key = gem + '|' + isCombo;
    if (!phases[key]) phases[key] = { gem, isCombo, early: 0, mid: 0, late: 0, total: 0, perWave: [] };
    const dmg = Number(r.total_damage);
    const w = Number(r.wave);
    phases[key].total += dmg;
    if (w <= 15) phases[key].early += dmg;
    else if (w <= 30) phases[key].mid += dmg;
    else phases[key].late += dmg;
    phases[key].perWave.push({ wave: w, damage: dmg, runs: Number(r.runs) });
  });

  Object.values(phases).forEach(p => {
    let shareSum = 0, shareN = 0, normSum = 0, normN = 0;
    p.perWave.forEach(wd => {
      const wt = waveTotals[wd.wave];
      if (wt > 0) { shareSum += wd.damage / wt; shareN++; }
      const hp = hpByWave[wd.wave];
      if (hp > 0 && wd.runs > 0) { normSum += (wd.damage / wd.runs) / hp; normN++; }
    });
    p.avgShare = shareN > 0 ? shareSum / shareN : 0;
    p.avgNorm = normN > 0 ? normSum / normN : 0;
  });

  const sorted = Object.values(phases).sort((a, b) => b.total - a.total);
  tbody.innerHTML = sorted.map(r => {
    const color = GEM_COLORS[r.gem] || C.muted;
    const typeLabel = r.isCombo ? 'Combo' : 'Base';
    return '<tr>' +
      '<td><span class="kind-dot" style="background:' + color + '"></span>' + capitalize(r.gem) + '</td>' +
      '<td>' + typeLabel + '</td>' +
      '<td class="num">' + fmtN(Math.round(r.early)) + '</td>' +
      '<td class="num">' + fmtN(Math.round(r.mid)) + '</td>' +
      '<td class="num">' + fmtN(Math.round(r.late)) + '</td>' +
      '<td class="num">' + fmtN(Math.round(r.total)) + '</td>' +
      '<td class="num">' + (r.avgShare * 100).toFixed(1) + '%</td>' +
      '<td class="num">' + (r.avgNorm * 100).toFixed(1) + '%</td></tr>';
  }).join('');
}

function renderKeeperTable(keepers) {
  const tbody = document.querySelector('#table-keepers tbody');
  if (!tbody || !keepers.length) return;
  tbody.innerHTML = keepers.map(r =>
    '<tr><td><span class="kind-dot" style="background:' + (GEM_COLORS[r.gem] || C.muted) + '"></span>' + capitalize(r.gem) + '</td>' +
    '<td class="num">' + r.count + '</td>' +
    '<td class="num">' + Number(r.avg_quality).toFixed(2) + '</td>' +
    '<td class="num">' + Number(r.avg_wave).toFixed(1) + '</td></tr>'
  ).join('');
}

function renderChanceTable(chance) {
  const tbody = document.querySelector('#table-chance tbody');
  if (!tbody || !chance.length) return;
  tbody.innerHTML = chance.map(r =>
    '<tr><td><span class="quality-badge q' + r.tier + '">L' + fmt(r.tier) + '</span></td>' +
    '<td class="num">' + Number(r.avg_wave).toFixed(1) + '</td>' +
    '<td class="num">' + fmt(r.avg_gold, 0) + '</td>' +
    '<td class="num">' + r.count + '</td></tr>'
  ).join('');
}

function makeSortable() {
  document.querySelectorAll('.data-table').forEach(table => {
    table.querySelectorAll('th').forEach((th, colIdx) => {
      const text = th.textContent.trim();
      if (!text) return;
      th.innerHTML = text + '<span class="sort-arrow">\\u25B2</span>';
      th.addEventListener('click', () => {
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        const wasAsc = th.dataset.sort === 'asc';
        table.querySelectorAll('th').forEach(h => { h.classList.remove('sorted'); delete h.dataset.sort; });
        const dir = wasAsc ? 'desc' : 'asc';
        th.dataset.sort = dir;
        th.classList.add('sorted');
        th.querySelector('.sort-arrow').textContent = dir === 'asc' ? '\\u25B2' : '\\u25BC';
        rows.sort((a, b) => {
          const aText = (a.cells[colIdx]?.getAttribute('data-sort') || a.cells[colIdx]?.textContent || '').replace(/[%,\\u2605]/g, '').trim();
          const bText = (b.cells[colIdx]?.getAttribute('data-sort') || b.cells[colIdx]?.textContent || '').replace(/[%,\\u2605]/g, '').trim();
          const aNum = parseFloat(aText);
          const bNum = parseFloat(bText);
          if (!isNaN(aNum) && !isNaN(bNum)) return dir === 'asc' ? aNum - bNum : bNum - aNum;
          return dir === 'asc' ? aText.localeCompare(bText) : bText.localeCompare(aText);
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    });
  });
}

async function load() {
  activeCharts.forEach(c => { try { c.destroy(); } catch(e) {} });
  activeCharts = [];
  const el = document.getElementById('content');
  el.innerHTML = '<p class="loading-msg">Loading\\u2026</p>';
  const params = { secret: SECRET };
  versionParams(params);
  runsetParams(params);
  updateExportLinks();

  try {
    const resp = await fetch(base + '/stats' + qs(params));
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    allVersions = data.versions || [];
    if (initialLoad && allVersions.length) {
      initialLoad = false;
      const sorted = [...allVersions].sort((a, b) => semverCmp(b, a));
      populateVersions(allVersions, sorted[0]);
      return load();
    }
    populateVersions(allVersions, document.getElementById('version').value);
    const loader = el.querySelector('.loading-msg');
    if (loader) {
      loader.classList.add('fade-out');
      await new Promise(r => setTimeout(r, 150));
    }
    render(data);
  } catch (err) {
    const loader = el.querySelector('.loading-msg');
    if (loader) {
      loader.classList.add('fade-out');
      await new Promise(r => setTimeout(r, 150));
    }
    el.innerHTML = '<div class="error-msg">' + err.message + '</div>';
  }
}

// Sidebar nav
document.querySelectorAll('#sidebar-nav a[data-target]').forEach(link => {
  link.addEventListener('click', () => {
    const target = document.getElementById(link.dataset.target);
    if (!target) return;
    const container = document.getElementById('content');
    container.scrollTo({ top: target.offsetTop - container.offsetTop - 12, behavior: 'smooth' });
  });
});

// Scroll spy
document.getElementById('content').addEventListener('scroll', () => {
  const container = document.getElementById('content');
  const scrollTop = container.scrollTop + 60;
  let activeId = '';
  container.querySelectorAll('.dash-section').forEach(sec => {
    if (sec.offsetTop - container.offsetTop <= scrollTop) activeId = sec.id;
  });
  document.querySelectorAll('#sidebar-nav a[data-target]').forEach(link => {
    link.classList.toggle('active', link.dataset.target === activeId);
  });
});

// Version mode change
document.getElementById('vmode').addEventListener('change', () => {
  populateVersions(allVersions);
});

// Runset toggle (real / sim) — reset version filter to avoid cross-runset mismatch
document.getElementById('runset').addEventListener('change', () => {
  const v = document.getElementById('version');
  if (v) v.value = '';
  load();
});

load();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
