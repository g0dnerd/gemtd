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
    transition: color 0.1s, background 0.1s;
  }
  .sidebar-nav a:hover { color: var(--fg); background: var(--fg-soft); }
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
  .sidebar-footer a:hover { color: var(--accent); }

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
    border-radius: var(--radius) 0 0 var(--radius); border-right: none;
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
  }
  .topbar-controls button:hover {
    background: color-mix(in oklch, var(--accent) 20%, transparent);
  }

  .content {
    flex: 1; overflow-y: auto; padding: 24px 28px 60px;
    scroll-behavior: smooth;
  }

  .dash-section { margin-bottom: 44px; }
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
  }
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
  .data-table th:hover { color: var(--fg); }
  .data-table th .sort-arrow {
    opacity: 0.3; margin-left: 3px; font-size: 9px;
  }
  .data-table th.sorted .sort-arrow { opacity: 1; color: var(--accent); }
  .data-table td {
    padding: 7px 14px;
    border-bottom: 1px solid color-mix(in oklch, var(--border) 40%, transparent);
  }
  .data-table tbody tr:hover td { background: var(--fg-soft); }
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
    height: 100%; border-radius: 2px; transition: width 0.3s ease;
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

  .loading-msg { color: var(--muted); padding: 60px 20px; text-align: center; font-size: 13px; }
  .error-msg {
    color: #f87171; padding: 16px 20px; font-size: 13px;
    background: rgba(248,113,113,0.06); border: 1px solid rgba(248,113,113,0.15);
    border-radius: var(--radius); margin: 20px 0;
  }

  .content::-webkit-scrollbar { width: 6px; }
  .content::-webkit-scrollbar-track { background: transparent; }
  .content::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  .content::-webkit-scrollbar-thumb:hover { background: var(--muted); }
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
    <a data-target="waves">Wave Progression</a>
    <a data-target="creeps">Creep Balance</a>
    <div class="nav-group">Towers</div>
    <a data-target="combos">Combos</a>
    <a data-target="gems">Gem Effectiveness</a>
    <a data-target="keepers">Keeper Choices</a>
    <div class="nav-group">Economy</div>
    <a data-target="economy">Gold &amp; Chance</a>
  </nav>
  <div class="sidebar-footer">
    <a id="exp-runs">Export runs (CSV)</a>
    <a id="exp-towers">Export towers (CSV)</a>
    <a id="exp-events">Export events (CSV)</a>
  </div>
</aside>
<div class="main">
  <header class="topbar">
    <span class="topbar-title">Dashboard</span>
    <div class="topbar-controls">
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

const creepColors = {
  boss: C.red, armored: C.violet, air: C.blue, fast: C.amber,
  healer: C.green, vessel: C.coral, wizard: C.violet, tunneler: C.teal,
  normal: C.muted, gazer: C.rose, coral: C.blue, anemone: C.green,
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

let allVersions = [];
let activeCharts = [];

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
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
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

function updateExportLinks() {
  const params = { secret: SECRET, format: 'csv' };
  versionParams(params);
  ['runs', 'towers', 'events'].forEach(ds => {
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

  // Combos
  h += '<section class="dash-section" id="combos"><div class="section-header"><h2>Combo Effectiveness</h2></div>';
  h += '<div class="table-panel"><div class="table-panel-header"><h3>Damage output by combo and tier</h3><span class="pill pill-accent">Sortable</span></div>';
  h += '<table class="data-table" id="table-combos"><thead><tr>';
  h += '<th>Combo</th><th class="num">Count</th><th class="num">Avg Dmg/Wave</th><th>Avg Total Dmg</th><th class="num">Avg Wave Built</th><th class="num">Wave Impact</th>';
  h += '</tr></thead><tbody></tbody></table></div></section>';

  // Gems
  h += '<section class="dash-section" id="gems"><div class="section-header"><h2>Gem Effectiveness</h2></div>';
  h += '<div class="table-panel"><div class="table-panel-header"><h3>Tower damage by gem type and quality</h3><span class="pill pill-accent">Sortable</span></div>';
  h += '<table class="data-table" id="table-gems"><thead><tr>';
  h += '<th>Gem</th><th>Quality</th><th class="num">Count</th><th class="num">Avg Dmg/Wave</th><th>Avg Total Dmg</th>';
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

  activeCharts.forEach(c => c.destroy());
  activeCharts = [];
  createCharts(data, total);

  renderComboTable(data.combos || [], avgWave);
  renderGemTable(data.gemDps || []);
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

  // Leaks per wave
  if (data.leaksPerWave && data.leaksPerWave.length) {
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
          data: data.leaksPerWave.map(r => Number(r.avg_leaks)),
          backgroundColor: grad, borderWidth: 0, borderRadius: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: true, aspectRatio: 2,
        scales: { x: { ...AXIS_OPTS }, y: { ...AXIS_OPTS, beginAtZero: true } },
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

function renderComboTable(combos, globalAvgWave) {
  const tbody = document.querySelector('#table-combos tbody');
  if (!tbody || !combos.length) return;
  const maxDmg = Math.max(...combos.map(r => Number(r.avg_damage)));
  tbody.innerHTML = combos.map(r => {
    const tier = Number(r.tier) || 0;
    const name = comboDisplayName(r.combo_key, tier);
    const p = maxDmg > 0 ? (Number(r.avg_damage) / maxDmg * 100) : 0;
    const badge = tier > 0
      ? ' <span class="quality-badge q' + Math.min(tier + 1, 5) + '" style="font-size:9px;margin-left:6px">\\u2605' + tier + '</span>'
      : '';
    const comboWave = Number(r.avg_wave_reached);
    const delta = !isNaN(comboWave) && !isNaN(globalAvgWave) ? comboWave - globalAvgWave : NaN;
    const deltaStr = isNaN(delta) ? '\\u2014'
      : (delta >= 0 ? '+' : '') + delta.toFixed(1);
    const deltaColor = isNaN(delta) ? '' : delta >= 0 ? 'color:' + C.green : 'color:' + C.red;
    return '<tr><td style="font-weight:500">' + name + badge + '</td>' +
      '<td class="num">' + r.count + '</td>' +
      '<td class="num">' + fmtN(Math.round(Number(r.avg_dmg_per_wave))) + '</td>' +
      '<td><div class="bar-cell"><span class="bar-value">' + fmtN(Math.round(Number(r.avg_damage))) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="width:' + p.toFixed(1) + '%;background:' + C.teal + '"></span></span></div></td>' +
      '<td class="num">' + Number(r.avg_wave_built).toFixed(1) + '</td>' +
      '<td class="num" style="' + deltaColor + ';font-weight:600">' + deltaStr + '</td></tr>';
  }).join('');
}

function renderGemTable(gems) {
  const tbody = document.querySelector('#table-gems tbody');
  if (!tbody || !gems.length) return;
  const maxDmg = Math.max(...gems.map(r => Number(r.avg_damage)));
  const qNames = { 1: 'Chipped', 2: 'Flawed', 3: 'Normal', 4: 'Flawless', 5: 'Perfect' };
  tbody.innerHTML = gems.map(r => {
    const p = maxDmg > 0 ? (Number(r.avg_damage) / maxDmg * 100) : 0;
    return '<tr><td><span class="kind-dot" style="background:' + (GEM_COLORS[r.gem] || C.muted) + '"></span>' + capitalize(r.gem) + '</td>' +
      '<td><span class="quality-badge q' + r.quality + '">' + (qNames[r.quality] || r.quality) + '</span></td>' +
      '<td class="num">' + r.count + '</td>' +
      '<td class="num">' + fmtN(Math.round(Number(r.avg_dmg_per_wave))) + '</td>' +
      '<td><div class="bar-cell"><span class="bar-value">' + fmtN(Math.round(Number(r.avg_damage))) + '</span>' +
      '<span class="bar-track"><span class="bar-fill" style="width:' + p.toFixed(1) + '%;background:' + (GEM_COLORS[r.gem] || C.teal) + '"></span></span></div></td></tr>';
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
          const aText = (a.cells[colIdx]?.textContent || '').replace(/[%,\\u2605]/g, '').trim();
          const bText = (b.cells[colIdx]?.textContent || '').replace(/[%,\\u2605]/g, '').trim();
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
  const el = document.getElementById('content');
  el.innerHTML = '<p class="loading-msg">Loading\\u2026</p>';
  const params = { secret: SECRET };
  versionParams(params);
  updateExportLinks();

  try {
    const resp = await fetch(base + '/stats' + qs(params));
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    allVersions = data.versions || [];
    populateVersions(allVersions, document.getElementById('version').value);
    render(data);
  } catch (err) {
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

load();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
