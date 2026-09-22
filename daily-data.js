// Daily check-in, meal log, warm-up and stretch log read/write helpers.
import { dbGet, dbPut, dbGetAllByIndex, metaGet } from './db.js';
import { PLANNED_MEALS_BY_WEEKDAY, MEAL_PLAN, warmupListFor, stretchListFor, DEFAULT_PROTEIN_TARGET_G } from './program.js';

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function getDailyLog(date) {
  const row = await dbGet('dailyLogs', date);
  return row || { date, weightKg: null, steps: null, sessionDone: null, cardioDone: null, ankleFasciaDone: null, notes: null };
}

export async function setDailyLog(date, patch) {
  const existing = await getDailyLog(date);
  const updated = { ...existing, ...patch, date };
  await dbPut('dailyLogs', updated);
  return updated;
}

export async function getProteinTarget() {
  return metaGet('proteinTargetG', DEFAULT_PROTEIN_TARGET_G);
}

// ---- meals ----
export async function getMealLog(date) {
  const row = await dbGet('mealLogs', date);
  const weekday = new Date(date + 'T00:00:00').getDay();
  const planned = PLANNED_MEALS_BY_WEEKDAY[weekday];
  const defaults = MEAL_PLAN.meals.map((m) => ({
    slot: m.slot,
    planned: planned[m.slot],
    targetKcal: m.kcal,
    targetProtein: m.proteinG,
    kcal: null,
    protein: null,
    confirmed: false,
  }));
  if (!row) return { date, meals: defaults };
  // merge in case MEAL_PLAN changed since last save
  const merged = defaults.map((d) => {
    const saved = row.meals.find((m) => m.slot === d.slot);
    return saved ? { ...d, ...saved } : d;
  });
  return { date, meals: merged };
}

export async function setMealEntry(date, slot, patch) {
  const log = await getMealLog(date);
  const meals = log.meals.map((m) => (m.slot === slot ? { ...m, ...patch } : m));
  await dbPut('mealLogs', { date, meals });
  return { date, meals };
}

export async function acceptPlannedMeal(date, slot) {
  const log = await getMealLog(date);
  const m = log.meals.find((x) => x.slot === slot);
  if (!m) return log;
  return setMealEntry(date, slot, { kcal: m.targetKcal, protein: m.targetProtein, confirmed: true });
}

export function dailyProteinTotal(mealLog) {
  return mealLog.meals.reduce((sum, m) => sum + (m.confirmed ? (m.protein || 0) : 0), 0);
}
export function dailyKcalTotal(mealLog) {
  return mealLog.meals.reduce((sum, m) => sum + (m.confirmed ? (m.kcal || 0) : 0), 0);
}

// ---- warm-up ----
export async function getWarmupStatus(date, session) {
  const list = warmupListFor(session);
  const out = [];
  for (const w of list) {
    const key = `${date}__${slug(w.item)}`;
    const row = await dbGet('warmupLogs', key);
    out.push({ ...w, done: row?.done ?? null, notes: row?.notes ?? null, key });
  }
  return out;
}

export async function setWarmupItem(date, session, week, item, done, notes) {
  const key = `${date}__${slug(item)}`;
  await dbPut('warmupLogs', { id: key, date, session, week, item, done, notes: notes ?? null });
}

// ---- stretch ----
export async function getStretchStatusForSession(date, session, week) {
  const list = stretchListFor(session);
  const out = [];
  for (const s of list) {
    const key = `${date}__${slug(s.item)}`;
    const row = await dbGet('stretchLogs', key);
    out.push({ ...s, held: row?.held ?? null, notes: row?.notes ?? null, key });
  }
  return out;
}

export async function setStretchItem(date, session, week, item, held, notes) {
  const key = `${date}__${slug(item)}`;
  await dbPut('stretchLogs', { id: key, date, session, week, item, held, notes: notes ?? null });
}
