import { buildXlsxBlob } from './vendor/minixlsx.js';
import { dbGetAll, dbClearAll, metaGet, dbPutMany } from './db.js';
import { MILESTONES, MEAL_PLAN } from './data/program.js';
import { weeklySummary, proteinTarget as getProteinTarget } from './dashboard-data.js';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportToXlsx() {
  const [workoutLogs, dailyLogs, mealLogs, warmupLogs, stretchLogs] = await Promise.all([
    dbGetAll('workoutLogs'), dbGetAll('dailyLogs'), dbGetAll('mealLogs'), dbGetAll('warmupLogs'), dbGetAll('stretchLogs'),
  ]);
  const target = await getProteinTarget();

  const workoutRows = [['Date', 'Week', 'Session', 'Exercise', 'Target', 'Set 1 Wt', 'Set 1 Reps', 'Set 2 Wt', 'Set 2 Reps', 'Set 3 Wt', 'Set 3 Reps', 'Set 4 Wt', 'Set 4 Reps', 'RPE', 'Pain (Y/N + note)']];
  workoutLogs
    .filter((w) => w.sets && w.sets.some(Boolean))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .forEach((w) => {
      const row = [w.date, w.week, w.session, w.exerciseName];
      row.push(''); // target not stored per-log; left blank on export
      for (let i = 0; i < 4; i++) {
        const s = w.sets[i];
        row.push(s ? s.w ?? '' : '', s ? s.reps ?? '' : '');
      }
      row.push(w.rpe ?? '');
      row.push(w.painFlag || w.painNote || '');
      workoutRows.push(row);
    });

  const dailyRows = [['Date', 'Day', 'Week', 'Session', 'Weight (kg)', 'Steps', 'Steps Target', 'Session Completed (Y/N)', 'Cardio/Mobility Done (Y/N)', 'Ankle+Fascia Work Done (Y/N)', 'Notes']];
  dailyLogs.sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((d) => {
    dailyRows.push([
      d.date, d.day || '', d.week ?? '', d.session || '', d.weightKg ?? '', d.steps ?? '', '',
      boolToYN(d.sessionDone), boolToYN(d.cardioDone), boolToYN(d.ankleFasciaDone), d.notes || '',
    ]);
  });

  const mealRows = [['Date', 'Slot', 'Planned', 'Kcal', 'Protein (g)', 'Confirmed']];
  mealLogs.sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((m) => {
    m.meals.forEach((meal) => {
      mealRows.push([m.date, meal.slot, meal.planned || '', meal.kcal ?? '', meal.protein ?? '', boolToYN(meal.confirmed)]);
    });
  });

  const warmupRows = [['Date', 'Week', 'Session', 'Item', 'Done (Y/N)', 'Notes']];
  warmupLogs.sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((w) => {
    warmupRows.push([w.date, w.week ?? '', w.session || '', w.item, boolToYN(w.done), w.notes || '']);
  });

  const stretchRows = [['Date', 'Week', 'Session', 'Item', 'Held Full Duration (Y/N)', 'Notes']];
  stretchLogs.sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((s) => {
    stretchRows.push([s.date, s.week ?? '', s.session || '', s.item, boolToYN(s.held), s.notes || '']);
  });

  const weekly = await weeklySummary();
  const weeklyRows = [['Week', 'Start Date', 'End Date', 'Avg Weight (kg)', 'Weight Change vs Wk1', 'Avg Steps', 'Days Steps Target Hit', `Avg Protein (g, target ${target})`, 'Days Protein Target Hit', 'Lifting Sessions Logged', 'Ankle/Fascia Sessions Done']];
  weekly.forEach((r) => {
    weeklyRows.push([r.week, r.start, r.end, r.avgWeight ?? '', r.weightChangeVsWk1 ?? '', r.avgSteps ?? '', `${r.daysStepsHit}/7`, r.avgProtein ?? '', `${r.daysProteinHit}/7`, `${r.sessionsLogged}/${r.liftingDaysTotal}`, `${r.ankleFasciaDone}/${r.ankleFasciaTotal}`]);
  });

  const milestonesRows = [['Week', 'Target Weight (kg)', 'Steps Target', 'Lifting Focus']];
  MILESTONES.forEach((m) => milestonesRows.push([m.week, m.targetWeightKg, m.stepsTarget, m.focus]));

  const mealPlanRows = [
    ['Meal Plan Reference'], [],
    ['Eating window', MEAL_PLAN.eatingWindow],
    ['Daily targets', `${MEAL_PLAN.dailyTargets.kcal} kcal | ${MEAL_PLAN.dailyTargets.proteinG}g protein`],
    [], ['Meal', 'Time', 'Target kcal', 'Target protein'],
  ];
  MEAL_PLAN.meals.forEach((m) => mealPlanRows.push([m.slot, m.time, m.kcal, `${m.proteinG}g`]));
  mealPlanRows.push([], ['Food (cooked)', 'Protein / 100g', 'Calories / 100g']);
  MEAL_PLAN.foodTable.forEach((f) => mealPlanRows.push([f.food, `${f.proteinPer100g}g`, f.kcalPer100g]));

  const blob = buildXlsxBlob([
    { name: 'Weekly Summary', rows: weeklyRows },
    { name: 'Milestones', rows: milestonesRows },
    { name: 'Daily Log', rows: dailyRows },
    { name: 'Meal Log', rows: mealRows },
    { name: 'Meal Plan Reference', rows: mealPlanRows },
    { name: 'Workout Log', rows: workoutRows },
    { name: 'Stretch Log', rows: stretchRows },
    { name: 'Warm-Up Log', rows: warmupRows },
  ]);
  downloadBlob(blob, `gym-tracker-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function boolToYN(v) {
  if (v === true) return 'Y';
  if (v === false) return 'N';
  return '';
}

// ---- JSON backup / restore (full fidelity, round-trips exactly) ----
export async function exportToJson() {
  const stores = ['meta', 'workoutLogs', 'warmupLogs', 'stretchLogs', 'dailyLogs', 'mealLogs', 'exerciseNotes', 'exerciseSettings', 'blocks'];
  const data = {};
  for (const s of stores) data[s] = await dbGetAll(s);
  const payload = { version: 1, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  downloadBlob(blob, `gym-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

export async function importFromJson(text) {
  const payload = JSON.parse(text);
  if (!payload || !payload.data) throw new Error('Invalid backup file');
  await dbClearAll();
  for (const [store, rows] of Object.entries(payload.data)) {
    if (rows && rows.length) await dbPutMany(store, rows);
  }
}
