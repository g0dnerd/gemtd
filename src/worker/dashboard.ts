export function handleDashboard(secret: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GemTD Telemetry</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; background: #1a1a2e; color: #e0e0e0; padding: 20px; }
  h1 { color: #e94560; margin-bottom: 20px; }
  h2 { color: #0f3460; background: #e94560; padding: 6px 12px; margin: 20px 0 10px; font-size: 14px; }
  .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .card { background: #16213e; border: 1px solid #0f3460; padding: 12px 16px; border-radius: 4px; min-width: 140px; }
  .card .label { font-size: 11px; color: #888; text-transform: uppercase; }
  .card .value { font-size: 24px; color: #e94560; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 13px; }
  th { text-align: left; padding: 6px 8px; background: #16213e; color: #e94560; border-bottom: 2px solid #0f3460; cursor: pointer; user-select: none; }
  th:hover { background: #1a2a4e; }
  th .sort-arrow { opacity: 0.4; margin-left: 4px; font-size: 10px; }
  th.sorted .sort-arrow { opacity: 1; }
  td { padding: 5px 8px; border-bottom: 1px solid #0f3460; }
  tr:hover td { background: #16213e; }
  .bar-cell { position: relative; }
  .bar { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(233, 69, 96, 0.15); }
  .bar-text { position: relative; z-index: 1; }
  .controls { margin-bottom: 16px; display: flex; gap: 8px; align-items: center; }
  select, button { font-family: inherit; font-size: 13px; background: #16213e; color: #e0e0e0; border: 1px solid #0f3460; padding: 4px 8px; cursor: pointer; }
  .loading { color: #888; padding: 20px; }
  .error { color: #e94560; padding: 10px; background: #2a1a1a; border: 1px solid #e94560; margin: 10px 0; }
  .export-links { margin-top: 16px; }
  .export-links a { color: #e94560; margin-right: 12px; font-size: 12px; }
</style>
</head>
<body>
<h1>GemTD Telemetry</h1>
<div class="controls">
  <label>Version: <select id="vmode"><option value="eq">=</option><option value="gte">>=</option></select></label>
  <select id="version"><option value="">All</option></select>
  <button onclick="load()">Refresh</button>
</div>
<div id="content"><p class="loading">Loading...</p></div>
<div class="export-links">
  <strong>Export:</strong>
  <a id="exp-runs" href="#">Runs (CSV)</a>
  <a id="exp-waves" href="#">Waves (CSV)</a>
  <a id="exp-towers" href="#">Towers (CSV)</a>
  <a id="exp-events" href="#">Events (CSV)</a>
</div>
<script>
const SECRET = ${JSON.stringify(secret)};
const base = '/api';

function qs(params) {
  const p = new URLSearchParams({ secret: SECRET, ...params });
  return '?' + p.toString();
}

let allVersions = [];

function semverCmp(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function versionParams(params) {
  const v = document.getElementById('version').value;
  const mode = document.getElementById('vmode').value;
  if (!v) return;
  if (mode === 'gte') {
    const matching = allVersions.filter(ver => semverCmp(ver, v) >= 0);
    if (matching.length && matching.length < allVersions.length) {
      params.versions = matching.join(',');
    }
  } else {
    params.version = v;
  }
}

function updateExportLinks() {
  const params = { secret: SECRET, format: 'csv' };
  versionParams(params);
  ['runs','waves','towers','events'].forEach(ds => {
    document.getElementById('exp-' + ds).href = base + '/export' + qs({ ...params, dataset: ds });
  });
}

async function load() {
  const v = document.getElementById('version').value;
  const params = { secret: SECRET };
  versionParams(params);
  const el = document.getElementById('content');
  el.innerHTML = '<p class="loading">Loading...</p>';
  updateExportLinks();

  try {
    const resp = await fetch(base + '/stats' + qs(params));
    if (!resp.ok) throw new Error(await resp.text());
    const data = await resp.json();
    allVersions = data.versions || [];
    populateVersions(allVersions, v);
    render(data);
  } catch (err) {
    el.innerHTML = '<div class="error">' + err.message + '</div>';
  }
}

function fmt(n, d) { return n == null ? '-' : Number(n).toFixed(d ?? 0); }
function pct(n) { return n == null ? '-' : (Number(n) * 100).toFixed(1) + '%'; }

function render(data) {
  const el = document.getElementById('content');
  const o = data.overview || {};
  const total = Number(o.total_runs) || 0;
  const wins = Number(o.wins) || 0;
  const winRate = total > 0 ? (wins / total) : 0;

  let html = '<div class="cards">';
  html += card('Total Runs', fmt(total));
  html += card('Win Rate', pct(winRate));
  html += card('Avg Wave', fmt(o.avg_wave, 1));
  html += card('Avg Kills', fmt(o.avg_kills, 0));
  html += card('Avg Duration', fmtTime(o.avg_duration_ticks));
  html += '</div>';

  // Survival curve
  if (data.survivalCurve?.length) {
    const maxRuns = Math.max(...data.survivalCurve.map(r => Number(r.runs)));
    html += '<h2>Wave Survival Curve</h2>';
    html += '<table><tr><th>Wave</th><th>Runs Reaching</th><th>% of Total</th><th></th></tr>';
    for (const row of data.survivalCurve) {
      const n = Number(row.runs);
      const p = total > 0 ? n / total : 0;
      const w = maxRuns > 0 ? (n / maxRuns * 100) : 0;
      html += '<tr><td>' + row.wave + '</td><td>' + n + '</td><td>' + pct(p) +
        '</td><td class="bar-cell"><span class="bar" style="width:' + w + '%"></span><span class="bar-text">' +
        '\\u2588'.repeat(Math.ceil(w / 5)) + '</span></td></tr>';
    }
    html += '</table>';
  }

  // Deaths by wave
  if (data.deathsByWave?.length) {
    const totalDeaths = data.deathsByWave.reduce((s, r) => s + Number(r.deaths), 0);
    const maxDeaths = Math.max(...data.deathsByWave.map(r => Number(r.deaths)));
    html += '<h2>Deaths by Wave</h2>';
    html += '<table><tr><th>Wave</th><th>Deaths</th><th>% of Deaths</th><th></th></tr>';
    for (const row of data.deathsByWave) {
      const n = Number(row.deaths);
      const p = totalDeaths > 0 ? n / totalDeaths : 0;
      const w = maxDeaths > 0 ? (n / maxDeaths * 100) : 0;
      html += '<tr><td>' + row.wave + '</td><td>' + n + '</td><td>' + pct(p) +
        '</td><td class="bar-cell"><span class="bar" style="width:' + w + '%"></span></td></tr>';
    }
    html += '</table>';
  }

  // Leaks per wave
  if (data.leaksPerWave?.length) {
    const maxLeak = Math.max(...data.leaksPerWave.map(r => Number(r.avg_leaks)));
    html += '<h2>Wave Leak Summary</h2>';
    html += '<table><tr><th>Wave</th><th>Avg Leaks</th><th>Avg Lives Lost</th><th>Total Leaks</th><th></th></tr>';
    for (const row of data.leaksPerWave) {
      const avg = Number(row.avg_leaks);
      const avgLost = Number(row.avg_lives_lost);
      const w = maxLeak > 0 ? (avg / maxLeak * 100) : 0;
      html += '<tr><td>' + row.wave + '</td><td>' + fmt(avg, 2) + '</td><td>' + fmt(avgLost, 2) + '</td><td>' + row.total_leaks +
        '</td><td class="bar-cell"><span class="bar" style="width:' + w + '%"></span></td></tr>';
    }
    html += '</table>';
  }

  // Leaks by creep kind
  if (data.leaksByKind?.length) {
    const maxLost = Math.max(...data.leaksByKind.map(r => Number(r.total_lives_lost)));
    const totalRuns = Number(o.total_runs) || 1;
    html += '<h2>Lives Lost by Creep Type</h2>';
    html += '<table><tr><th>Creep</th><th>Leaks</th><th>Total Lives Lost</th><th>Avg Lives/Run</th><th>Avg Cost/Leak</th><th></th></tr>';
    for (const row of data.leaksByKind) {
      const totalLost = Number(row.total_lives_lost);
      const w = maxLost > 0 ? (totalLost / maxLost * 100) : 0;
      html += '<tr><td>' + row.creep_kind + '</td><td>' + row.leak_count + '</td><td>' + fmt(totalLost, 0) + '</td><td>' + fmt(totalLost / totalRuns, 1) + '</td><td>' + fmt(row.avg_lives_per_leak, 1) + '</td><td class="bar-cell"><span class="bar" style="width:' + w + '%"></span></td></tr>';
    }
    html += '</table>';
  }

  // Combo effectiveness
  if (data.combos?.length) {
    html += '<h2>Combo Effectiveness</h2>';
    html += '<table><tr><th>Combo</th><th>Tier</th><th>Count</th><th>Avg Dmg/Wave</th><th>Avg Total Dmg</th><th>Avg Wave Built</th></tr>';
    for (const row of data.combos) {
      const tier = Number(row.tier) || 0;
      html += '<tr><td>' + row.combo_key + '</td><td>' + (tier === 0 ? 'Base' : '\\u2605 ' + tier) + '</td><td>' + row.count + '</td><td>' + fmt(row.avg_dmg_per_wave, 0) + '</td><td>' + fmt(row.avg_damage, 0) + '</td><td>' + fmt(row.avg_wave_built, 1) + '</td></tr>';
    }
    html += '</table>';
  }

  // Gem effectiveness
  if (data.gemDps?.length) {
    const qNames = { 1: 'Chipped', 2: 'Flawed', 3: 'Normal', 4: 'Flawless', 5: 'Perfect' };
    html += '<h2>Tower Effectiveness by Gem</h2>';
    html += '<table><tr><th>Gem</th><th>Quality</th><th>Count</th><th>Avg Dmg/Wave</th><th>Avg Total Dmg</th></tr>';
    for (const row of data.gemDps) {
      const q = qNames[row.quality] || row.quality;
      html += '<tr><td>' + row.gem + '</td><td>' + q + '</td><td>' + row.count + '</td><td>' + fmt(row.avg_dmg_per_wave, 0) + '</td><td>' + fmt(row.avg_damage, 0) + '</td></tr>';
    }
    html += '</table>';
  }

  // Chance tier timing
  if (data.chanceTiming?.length) {
    html += '<h2>Chance Tier Upgrade Timing</h2>';
    html += '<table><tr><th>Tier</th><th>Avg Wave</th><th>Avg Gold</th><th>Count</th></tr>';
    for (const row of data.chanceTiming) {
      html += '<tr><td>L' + fmt(row.tier) + '</td><td>' + fmt(row.avg_wave, 1) + '</td><td>' + fmt(row.avg_gold, 0) + '</td><td>' + row.count + '</td></tr>';
    }
    html += '</table>';
  }

  // Keeper quality curve
  if (data.keeperCurve?.length) {
    html += '<h2>Average Keeper Quality by Wave</h2>';
    html += '<table><tr><th>Wave</th><th>Avg Quality</th></tr>';
    for (const row of data.keeperCurve) {
      html += '<tr><td>' + row.wave + '</td><td>' + fmt(row.avg_keeper_quality, 2) + '</td></tr>';
    }
    html += '</table>';
  }

  // Keeper choice distribution
  if (data.keeperChoices?.length) {
    html += '<h2>Keeper Choice Distribution</h2>';
    html += '<table><tr><th>Gem</th><th>Times Kept</th><th>Avg Quality</th><th>Avg Wave Kept</th></tr>';
    for (const row of data.keeperChoices) {
      html += '<tr><td>' + row.gem + '</td><td>' + row.count + '</td><td>' + fmt(row.avg_quality, 2) + '</td><td>' + fmt(row.avg_wave, 1) + '</td></tr>';
    }
    html += '</table>';
  }

  // Lives remaining curve
  if (data.leaksPerWave?.length) {
    const maxLives = Math.max(...data.leaksPerWave.map(r => Number(r.avg_lives)));
    html += '<h2>Lives Remaining by Wave</h2>';
    html += '<table><tr><th>Wave</th><th>Avg Lives</th><th></th></tr>';
    for (const row of data.leaksPerWave) {
      const lives = Number(row.avg_lives);
      const w = maxLives > 0 ? (lives / maxLives * 100) : 0;
      html += '<tr><td>' + row.wave + '</td><td>' + fmt(lives, 1) + '</td><td class="bar-cell"><span class="bar" style="width:' + w + '%"></span></td></tr>';
    }
    html += '</table>';
  }

  // Wave damage output
  if (data.waveDamage?.length) {
    const maxDmg = Math.max(...data.waveDamage.map(r => Number(r.avg_damage)));
    html += '<h2>Wave Damage Output</h2>';
    html += '<table><tr><th>Wave</th><th>Avg Damage</th><th></th></tr>';
    for (const row of data.waveDamage) {
      const dmg = Number(row.avg_damage);
      const w = maxDmg > 0 ? (dmg / maxDmg * 100) : 0;
      html += '<tr><td>' + row.wave + '</td><td>' + fmt(dmg, 0) + '</td><td class="bar-cell"><span class="bar" style="width:' + w + '%"></span></td></tr>';
    }
    html += '</table>';
  }

  // Gold economy curve
  if (data.leaksPerWave?.length) {
    const maxGold = Math.max(...data.leaksPerWave.map(r => Number(r.avg_gold)));
    html += '<h2>Gold Economy by Wave</h2>';
    html += '<table><tr><th>Wave</th><th>Avg Gold</th><th></th></tr>';
    for (const row of data.leaksPerWave) {
      const gold = Number(row.avg_gold);
      const w = maxGold > 0 ? (gold / maxGold * 100) : 0;
      html += '<tr><td>' + row.wave + '</td><td>' + fmt(gold, 0) + '</td><td class="bar-cell"><span class="bar" style="width:' + w + '%"></span></td></tr>';
    }
    html += '</table>';
  }

  el.innerHTML = html;
  makeSortable();
}

function card(label, value) {
  return '<div class="card"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>';
}

function fmtTime(ticks) {
  if (ticks == null) return '-';
  const secs = Math.round(Number(ticks) / 60);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m + ':' + String(s).padStart(2, '0');
}

function makeSortable() {
  document.querySelectorAll('table').forEach(table => {
    const headers = table.querySelectorAll('th');
    headers.forEach((th, colIdx) => {
      if (th.closest('.bar-cell') || th.textContent.trim() === '') return;
      th.innerHTML = th.textContent + '<span class="sort-arrow">\\u25B2</span>';
      th.addEventListener('click', () => sortTable(table, colIdx, th));
    });
  });
}

function sortTable(table, colIdx, th) {
  const tbody = table.querySelector('tbody') || table;
  const headerRow = table.querySelector('tr');
  const rows = Array.from(table.querySelectorAll('tr')).slice(1);
  if (rows.length === 0) return;

  const allHeaders = table.querySelectorAll('th');
  const wasAsc = th.dataset.sort === 'asc';
  allHeaders.forEach(h => { h.classList.remove('sorted'); delete h.dataset.sort; });

  const dir = wasAsc ? 'desc' : 'asc';
  th.dataset.sort = dir;
  th.classList.add('sorted');
  th.querySelector('.sort-arrow').textContent = dir === 'asc' ? '\\u25B2' : '\\u25BC';

  rows.sort((a, b) => {
    const aCell = a.cells[colIdx];
    const bCell = b.cells[colIdx];
    if (!aCell || !bCell) return 0;
    const aText = aCell.textContent.replace('%', '').trim();
    const bText = bCell.textContent.replace('%', '').trim();
    const aNum = parseFloat(aText);
    const bNum = parseFloat(bText);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return dir === 'asc' ? aNum - bNum : bNum - aNum;
    }
    return dir === 'asc' ? aText.localeCompare(bText) : bText.localeCompare(aText);
  });

  rows.forEach(r => tbody.appendChild(r));
}

function populateVersions(versions, selected) {
  const sel = document.getElementById('version');
  const cur = selected || sel.value;
  sel.innerHTML = '<option value="">All</option>';
  for (const v of versions) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    if (v === cur) opt.selected = true;
    sel.appendChild(opt);
  }
}

load();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
