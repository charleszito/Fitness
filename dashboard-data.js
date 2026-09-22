// Aggregation logic for the Dashboard: weight trend, lift progression,
// adherence, pain map and the workbook-equivalent Weekly Summary / Milestones,
// with the three inconsistency fixes from the source workbook applied.
import { dbGetAll, dbGetAllByIndex, metaGet } from './db.js';
import {
  PLAN_START_DATE, PLAN_WEEKS, STEPS_TARGETS, MILESTONES, LIFTING_SESSIONS,
  SESSIONS, WEEKLY_CYCLE, addDays, dateToWeek, sessionForDate, DEFAULT_PROTEIN_TARGET_G,
} from './data/program.js';

export async function getAllDailyLogs() {
  return dbGetAll('dailyLogs');
}
export async function getAllMealLogs() {
  return dbGetAll('mealLogs');
}
export async function getAllWorkoutLogs() {
  return dbGetAll('workoutLogs');
}
export async function getAllWarmupLogs() {
  return dbGetAll('warmupLogs');
}
export async function getAllStretchLogs() {
  return dbGetAll('stretchLogs');
}

function weekDateRange(week) {
  const start = addDays(PLAN_START_DATE, (week - 1) * 7);
  const end = addDays(start, 6);
  return { start, end };
}

// Fix #1: a single configurable protein target used everywhere (default 185g).
export async function proteinTarget() {
  return metaGet('proteinTargetG', DEFAULT_PROTEIN_TARGET_G);
}

function proteinForDate(mealLogs, date) {
  const log = mealLogs.find((m) => m.date === date);
  if (!log) return 0;
  return log.meals.reduce((sum, m) => sum + (m.confirmed ? (m.protein || 0) : 0), 0);
}

// True trailing 7-calendar-day rolling average (not the workbook's cumulative-since-day-1 quirk).
export function rollingAverageWeight(dailyLogs) {
  const withWeight = dailyLogs.filter((d) => d.weightKg != null).sort((a, b) => (a.date < b.date ? -1 : 1));
  const byDate = Object.fromEntries(withWeight.map((d) => [d.date, d.weightKg]));
  return withWeight.map((d) => {
    let sum = 0, count = 0;
    for (let i = 0; i < 7; i++) {
      const dt = addDays(d.date, -i);
      if (byDate[dt] != null) { sum += byDate[dt]; count++; }
    }
    return { date: d.date, weight: d.weightKg, avg: sum / count };
  });
}

// Fix #3 mirrored here for volume/adherence math elsewhere: how many sets
// were actually prescribed that week for a given exercise.
export function prescribedSetsForWeek(week, exercise) {
  if (week >= 8) return Math.min(exercise.sets, 2);
  if (week >= 5 && week <= 7 && exercise.category === 'main') return 4;
  return exercise.sets;
}

export async function stallAlert(dailyLogs) {
  const series = rollingAverageWeight(dailyLogs);
  if (series.length < 8) return null;
  const last = series[series.length - 1];
  // look back up to 14 days for a point whose avg was no higher than `last`
  // (i.e. the average hasn't meaningfully dropped in 14+ days)
  const cutoffDate = addDays(last.date, -14);
  const older = series.filter((s) => s.date <= cutoffDate);
  if (!older.length) return null;
  const refPoint = older[older.length - 1];
  const drop = refPoint.avg - last.avg;
  if (drop < 0.3) {
    return {
      sinceDate: refPoint.date,
      days: Math.round((new Date(last.date) - new Date(refPoint.date)) / 86400000),
      message: 'Trim ~30g off a Meal 2 carb portion before touching protein.',
    };
  }
  return null;
}

export function epley1RM(weight, reps) {
  if (weight == null || reps == null) return null;
  const w = Math.abs(weight); // assisted pull-ups: use magnitude, UI labels it separately
  return Math.round(w * (1 + reps / 30) * 10) / 10;
}

export async function liftProgression(exerciseId) {
  const logs = await dbGetAllByIndex('workoutLogs', 'byExercise', exerciseId);
  return logs
    .filter((l) => l.sets && l.sets.some(Boolean))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((l) => {
      const validSets = l.sets.filter(Boolean);
      const topSet = validSets.reduce((best, s) => {
        const e1 = epley1RM(s.w, s.reps);
        return !best || (e1 != null && e1 > best.e1) ? { ...s, e1 } : best;
      }, null);
      const topWeight = validSets.reduce((max, s) => (s.w != null && Math.abs(s.w) > Math.abs(max ?? -Infinity) ? s.w : max), null);
      return { date: l.date, week: l.week, est1RM: topSet?.e1 ?? null, topWeight, sets: validSets };
    });
}

export function weeklyVolume(workoutLogs, exerciseId) {
  const byWeek = {};
  workoutLogs.filter((l) => l.exerciseId === exerciseId).forEach((l) => {
    const vol = (l.sets || []).filter(Boolean).reduce((sum, s) => sum + (s.w != null ? Math.abs(s.w) * (s.reps || 0) : 0), 0);
    byWeek[l.week] = (byWeek[l.week] || 0) + vol;
  });
  return byWeek;
}

export async function painMap(workoutLogs) {
  return workoutLogs
    .filter((l) => l.painFlag === 'Y')
    .map((l) => ({ date: l.date, week: l.week, exercise: l.exerciseName, note: l.painNote }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// ---- Weekly Summary (workbook-equivalent, with fixes applied) ----
export async function weeklySummary() {
  const dailyLogs = await getAllDailyLogs();
  const mealLogs = await getAllMealLogs();
  const workoutLogs = await getAllWorkoutLogs();
  const warmupLogs = await getAllWarmupLogs();
  const target = await proteinTarget();

  const rows = [];
  let week1Avg = null;
  for (let week = 1; week <= PLAN_WEEKS; week++) {
    const { start, end } = weekDateRange(week);
    const daysInWeek = [];
    for (let i = 0; i < 7; i++) daysInWeek.push(addDays(start, i));

    const weights = daysInWeek.map((d) => dailyLogs.find((x) => x.date === d)?.weightKg).filter((v) => v != null);
    const avgWeight = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : null;
    if (week === 1) week1Avg = avgWeight;

    const stepsVals = daysInWeek.map((d) => dailyLogs.find((x) => x.date === d)?.steps).filter((v) => v != null);
    const avgSteps = stepsVals.length ? Math.round(stepsVals.reduce((a, b) => a + b, 0) / stepsVals.length) : null;
    // Fix #2: compare each day against that day's own ramped target, not a hard-coded 10000.
    const daysStepsHit = daysInWeek.filter((d, i) => {
      const v = dailyLogs.find((x) => x.date === d)?.steps;
      return v != null && v >= STEPS_TARGETS[week - 1];
    }).length;

    const proteinVals = daysInWeek.map((d) => proteinForDate(mealLogs, d)).filter((v) => v > 0);
    const avgProtein = proteinVals.length ? Math.round(proteinVals.reduce((a, b) => a + b, 0) / proteinVals.length) : null;
    // Fix #1: single configurable target (default 185g) used for the "hit" count too.
    const daysProteinHit = daysInWeek.filter((d) => proteinForDate(mealLogs, d) >= target).length;

    const liftingDays = daysInWeek.filter((d) => LIFTING_SESSIONS.includes(sessionForDate(d)));
    const sessionsLogged = liftingDays.filter((d) => {
      const dl = dailyLogs.find((x) => x.date === d);
      if (dl?.sessionDone) return true;
      return workoutLogs.some((w) => w.date === d && w.sets && w.sets.some(Boolean));
    }).length;

    const ankleFasciaDays = daysInWeek.filter((d) => !['Upper A', 'Upper B'].includes(sessionForDate(d)));
    const ankleFasciaDone = ankleFasciaDays.filter((d) => dailyLogs.find((x) => x.date === d)?.ankleFasciaDone === true).length;

    rows.push({
      week, start, end, avgWeight, weightChangeVsWk1: avgWeight != null && week1Avg != null ? Math.round((avgWeight - week1Avg) * 10) / 10 : null,
      avgSteps, daysStepsHit, avgProtein, daysProteinHit, sessionsLogged, liftingDaysTotal: liftingDays.length, ankleFasciaDone, ankleFasciaTotal: ankleFasciaDays.length,
    });
  }
  return rows;
}

export async function milestonesWithStatus(weeklySummaryRows) {
  return MILESTONES.map((m) => {
    const row = weeklySummaryRows.find((r) => r.week === m.week);
    const hit = row?.avgWeight != null ? row.avgWeight <= m.targetWeightKg + 0.2 : null;
    return { ...m, avgWeight: row?.avgWeight ?? null, hit };
  });
}

export async function adherenceSummary() {
  const dailyLogs = await getAllDailyLogs();
  const warmupLogs = await getAllWarmupLogs();
  const stretchLogs = await getAllStretchLogs();
  const workoutLogs = await getAllWorkoutLogs();
  const target = await proteinTarget();
  const mealLogs = await getAllMealLogs();

  const today = new Date().toISOString().slice(0, 10);
  const planEnd = addDays(PLAN_START_DATE, PLAN_WEEKS * 7 - 1);
  const cutoff = today < planEnd ? today : planEnd;

  const elapsedDates = [];
  let d = PLAN_START_DATE;
  while (d <= cutoff) { elapsedDates.push(d); d = addDays(d, 1); }

  const liftingDates = elapsedDates.filter((dt) => LIFTING_SESSIONS.includes(sessionForDate(dt)));
  const sessionsCompleted = liftingDates.filter((dt) => {
    const dl = dailyLogs.find((x) => x.date === dt);
    if (dl?.sessionDone) return true;
    return workoutLogs.some((w) => w.date === dt && w.sets && w.sets.some(Boolean));
  }).length;

  const warmupsExpected = liftingDates.length;
  const warmupsDone = liftingDates.filter((dt) => {
    const items = warmupLogs.filter((w) => w.date === dt);
    return items.length > 0 && items.every((w) => w.done === true);
  }).length;

  const stretchesExpected = elapsedDates.length;
  const stretchesDone = elapsedDates.filter((dt) => {
    const items = stretchLogs.filter((s) => s.date === dt);
    return items.length > 0 && items.every((s) => s.held === true);
  }).length;

  const ankleFasciaDates = elapsedDates.filter((dt) => !['Upper A', 'Upper B'].includes(sessionForDate(dt)));
  const ankleFasciaDone = ankleFasciaDates.filter((dt) => dailyLogs.find((x) => x.date === dt)?.ankleFasciaDone === true).length;

  const stepsHit = elapsedDates.filter((dt) => {
    const v = dailyLogs.find((x) => x.date === dt)?.steps;
    const week = dateToWeek(dt);
    return v != null && v >= STEPS_TARGETS[Math.min(week, 8) - 1];
  }).length;

  const proteinHit = elapsedDates.filter((dt) => proteinForDate(mealLogs, dt) >= target).length;

  return {
    sessionsCompleted, sessionsExpected: liftingDates.length,
    warmupsDone, warmupsExpected,
    stretchesDone, stretchesExpected,
    ankleFasciaDone, ankleFasciaExpected: ankleFasciaDates.length,
    stepsHit, stepsExpected: elapsedDates.length,
    proteinHit, proteinExpected: elapsedDates.length,
  };
}
