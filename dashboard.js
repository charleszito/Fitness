import { el } from './ui.js';
import { lineChartSVG, barChartSVG, statRow, progressBar } from './chart.js';
import {
  getAllDailyLogs, getAllWorkoutLogs, rollingAverageWeight, stallAlert, liftProgression,
  weeklyVolume, painMap, weeklySummary, milestonesWithStatus, adherenceSummary, proteinTarget,
  epley1RM,
} from './dashboard-data.js';
import { SESSIONS, MILESTONES, dateToWeek } from './program.js';

const MAIN_LIFTS = Object.values(SESSIONS).flat().filter((e) => e.category === 'main');
let selectedLiftId = MAIN_LIFTS[0]?.id;

export async function mountDashboard() {
  const root = document.getElementById('screen-dashboard');
  root.innerHTML = '';
  root.appendChild(el(`<div class="page-title">Dashboard</div><div class="page-sub">Progress across all 8 weeks</div>`));

  const grid = el(`<div class="dash-grid"></div>`);
  root.appendChild(grid);

  grid.appendChild(await buildWeightCard());
  grid.appendChild(await buildLiftCard());
  grid.appendChild(await buildAdherenceCard());
  grid.appendChild(await buildPainCard());
  grid.appendChild(await buildWeeklySummaryCard());
  grid.appendChild(await buildMilestonesCard());
}

async function buildWeightCard() {
  const dailyLogs = await getAllDailyLogs();
  const series = rollingAverageWeight(dailyLogs);
  const stall = await stallAlert(dailyLogs);
  const card = el(`<div class="card"></div>`);
  card.appendChild(el(`<div class="row-label">Weight</div>`));

  if (!series.length) {
    card.appendChild(el(`<div class="empty-state">Log a morning weight in Check-in to see your trend.</div>`));
    return card;
  }

  const last = series[series.length - 1];
  const first = series[0];
  const week = dateToWeek(last.date);
  const milestone = MILESTONES[Math.min(week, 8) - 1];
  const change = Math.round((last.avg - first.avg) * 10) / 10;

  card.appendChild(el(`
    <div style="display:flex;align-items:baseline;gap:10px;margin:4px 0 10px;">
      <span style="font-size:30px;font-weight:800;">${last.avg.toFixed(1)}<span style="font-size:16px;color:var(--text-dim);"> kg</span></span>
      <span style="color:${change <= 0 ? 'var(--ok)' : 'var(--warn)'};font-weight:700;font-size:14px;">${change > 0 ? '+' : ''}${change} kg since Wk1</span>
    </div>
    <div style="color:var(--text-dim);font-size:13px;margin-bottom:8px;">This week's target: ${milestone.targetWeightKg} kg</div>
  `));

  const chartWrap = el(`<div></div>`);
  chartWrap.innerHTML = lineChartSVG({
    series: [
      { type: 'dots', color: 'var(--text-faint)', points: series.map((s, i) => ({ x: i, y: s.weight })) },
      { type: 'line', color: 'var(--accent)', points: series.map((s, i) => ({ x: i, y: s.avg })) },
    ],
    yTarget: milestone.targetWeightKg,
  });
  card.appendChild(chartWrap);
  card.appendChild(el(`<div style="display:flex;gap:16px;margin-top:8px;font-size:12px;color:var(--text-dim);"><span>● daily weigh-in</span><span style="color:var(--accent);">— 7-day average</span><span>┄ target</span></div>`));

  if (stall) {
    card.appendChild(el(`
      <div style="margin-top:14px;background:color-mix(in srgb, var(--warn) 15%, transparent);border-radius:12px;padding:12px;">
        <div style="font-weight:800;color:var(--warn);font-size:13px;">⚠ ${stall.days}-day plateau</div>
        <div style="font-size:13px;color:var(--text-dim);margin-top:4px;">${stall.message}</div>
      </div>
    `));
  }
  return card;
}

async function buildLiftCard() {
  const card = el(`<div class="card"></div>`);
  card.appendChild(el(`<div class="row-label">Lift progression</div>`));
  const select = el(`<select style="width:100%;min-height:44px;border-radius:10px;border:1px solid var(--border);background:var(--bg-elev2);color:var(--text);padding:8px 12px;margin-bottom:10px;font-size:15px;"></select>`);
  MAIN_LIFTS.forEach((ex) => {
    select.appendChild(el(`<option value="${ex.id}" ${ex.id === selectedLiftId ? 'selected' : ''}>${ex.name}</option>`));
  });
  card.appendChild(select);

  const chartArea = el(`<div id="lift-chart-area"></div>`);
  card.appendChild(chartArea);

  async function renderLift(id) {
    selectedLiftId = id;
    const prog = await liftProgression(id);
    chartArea.innerHTML = '';
    if (!prog.length) {
      chartArea.appendChild(el(`<div class="empty-state">No sets logged for this lift yet.</div>`));
      return;
    }
    const last = prog[prog.length - 1];
    chartArea.appendChild(el(`
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:6px;">Est. 1RM (Epley) · latest ${last.est1RM ?? '—'} </div>
    `));
    const chartEl = el(`<div></div>`);
    chartEl.innerHTML = lineChartSVG({
      series: [{ type: 'line', color: 'var(--accent)', points: prog.map((p, i) => ({ x: i, y: p.est1RM })) }],
      height: 110,
    });
    chartArea.appendChild(chartEl);

    const workoutLogs = await getAllWorkoutLogs();
    const vol = weeklyVolume(workoutLogs, id);
    const bars = Object.keys(vol).sort((a, b) => a - b).map((w) => ({ label: `W${w}`, value: Math.round(vol[w]) }));
    chartArea.appendChild(el(`<div style="font-size:13px;color:var(--text-dim);margin:12px 0 4px;">Weekly volume (kg × reps)</div>`));
    const barEl = el(`<div></div>`);
    barEl.innerHTML = barChartSVG({ bars, height: 100 });
    chartArea.appendChild(barEl);
  }

  select.addEventListener('change', () => renderLift(select.value));
  await renderLift(selectedLiftId);
  return card;
}

async function buildAdherenceCard() {
  const a = await adherenceSummary();
  const card = el(`<div class="card"></div>`);
  card.appendChild(el(`<div class="row-label">Adherence</div>`));
  const rows = [
    ['Sessions completed', a.sessionsCompleted, a.sessionsExpected],
    ['Warm-ups fully done', a.warmupsDone, a.warmupsExpected],
    ['Stretches fully held', a.stretchesDone, a.stretchesExpected],
    ['Ankle/fascia sessions', a.ankleFasciaDone, a.ankleFasciaExpected],
    ['Days steps target hit', a.stepsHit, a.stepsExpected],
    ['Days protein target hit', a.proteinHit, a.proteinExpected],
  ];
  rows.forEach(([label, done, total]) => {
    const pct = total > 0 ? (done / total) * 100 : 0;
    const row = el(`
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;">
          <span style="color:var(--text-dim);">${label}</span>
          <span style="font-weight:700;">${done}/${total}</span>
        </div>
      </div>
    `);
    const barWrap = el(`<div></div>`);
    barWrap.innerHTML = progressBar(pct);
    row.appendChild(barWrap);
    card.appendChild(row);
  });
  return card;
}

async function buildPainCard() {
  const workoutLogs = await getAllWorkoutLogs();
  const pains = await painMap(workoutLogs);
  const card = el(`<div class="card"></div>`);
  card.appendChild(el(`<div class="row-label">Pain map</div>`));
  if (!pains.length) {
    card.appendChild(el(`<div class="empty-state">No pain flags logged. 🎉</div>`));
    return card;
  }
  pains.forEach((p) => {
    card.appendChild(el(`
      <div class="block-row">
        <div><div class="block-title" style="font-size:14px;">${p.exercise}</div><div class="block-meta">Week ${p.week} · ${p.date}${p.note ? ' · ' + p.note : ''}</div></div>
      </div>
    `));
  });
  return card;
}

async function buildWeeklySummaryCard() {
  const rows = await weeklySummary();
  const target = await proteinTarget();
  const card = el(`<div class="card" style="overflow-x:auto;"></div>`);
  card.appendChild(el(`<div class="row-label">Weekly summary (protein target ${target}g, steps ramp per week)</div>`));
  const table = el(`
    <table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap;">
      <thead><tr style="color:var(--text-faint);text-align:left;">
        <th style="padding:6px 8px;">Wk</th><th style="padding:6px 8px;">Avg kg</th><th style="padding:6px 8px;">Δ vs Wk1</th>
        <th style="padding:6px 8px;">Avg steps</th><th style="padding:6px 8px;">Steps hit</th>
        <th style="padding:6px 8px;">Avg protein</th><th style="padding:6px 8px;">Protein hit</th>
        <th style="padding:6px 8px;">Sessions</th><th style="padding:6px 8px;">Ankle/fascia</th>
      </tr></thead>
      <tbody></tbody>
    </table>
  `);
  const tbody = table.querySelector('tbody');
  rows.forEach((r) => {
    tbody.appendChild(el(`
      <tr style="border-top:1px solid var(--border);">
        <td style="padding:7px 8px;font-weight:700;">${r.week}</td>
        <td style="padding:7px 8px;">${r.avgWeight != null ? r.avgWeight.toFixed(1) : '—'}</td>
        <td style="padding:7px 8px;">${r.weightChangeVsWk1 != null ? r.weightChangeVsWk1 : '—'}</td>
        <td style="padding:7px 8px;">${r.avgSteps ?? '—'}</td>
        <td style="padding:7px 8px;">${r.daysStepsHit}/7</td>
        <td style="padding:7px 8px;">${r.avgProtein ?? '—'}</td>
        <td style="padding:7px 8px;">${r.daysProteinHit}/7</td>
        <td style="padding:7px 8px;">${r.sessionsLogged}/${r.liftingDaysTotal}</td>
        <td style="padding:7px 8px;">${r.ankleFasciaDone}/${r.ankleFasciaTotal}</td>
      </tr>
    `));
  });
  card.appendChild(table);
  return card;
}

async function buildMilestonesCard() {
  const rows = await weeklySummary();
  const ms = await milestonesWithStatus(rows);
  const card = el(`<div class="card"></div>`);
  card.appendChild(el(`<div class="row-label">Milestones</div>`));
  ms.forEach((m) => {
    const chip = m.hit == null ? '<span class="progress-chip">Pending</span>' : m.hit ? '<span class="progress-chip done">Hit</span>' : '<span class="progress-chip" style="background:color-mix(in srgb, var(--danger) 20%, transparent);color:var(--danger);">Missed</span>';
    card.appendChild(el(`
      <div class="block-row">
        <div>
          <div class="block-title" style="font-size:14px;">Week ${m.week} · target ${m.targetWeightKg} kg</div>
          <div class="block-meta">${m.focus}${m.avgWeight != null ? ` · actual ${m.avgWeight.toFixed(1)} kg` : ''}</div>
        </div>
        ${chip}
      </div>
    `));
  });
  return card;
}
