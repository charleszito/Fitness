// Core read/write logic for workout logging: last-time lookups, set logging,
// undo, per-exercise settings (unit/increment/rest) and carry-forward notes.
import { dbGet, dbGetAllByIndex, dbPut, metaGet } from './db.js';
import { SESSIONS, prescribedSets } from './program.js';

const recordKey = (date, exerciseId) => `${date}__${exerciseId}`;

export async function getExercisesForSession(session, week) {
  const base = SESSIONS[session] || [];
  const overrides = await metaGet('planOverrides', {});
  const sessionOverrides = overrides[session] || {};
  return base.map((exOriginal) => {
    const ov = sessionOverrides[exOriginal.id];
    const exBase = ov && ov.replacement ? { ...exOriginal, ...ov.replacement, id: exOriginal.id, _replacedFrom: exOriginal.name } : exOriginal;
    const prescribed = ov?.setsOverride ?? prescribedSets(week, exBase);
    const restSec = ov?.restSec ?? exBase.restSec;
    return { ...exBase, prescribedSets: prescribed, restSec };
  });
}

export async function getExerciseSettings(exerciseId, fallbackUnit, fallbackIncrement, fallbackRest) {
  const row = await dbGet('exerciseSettings', exerciseId);
  return {
    unit: row?.unit ?? fallbackUnit,
    increment: row?.increment ?? fallbackIncrement,
    restSec: row?.restSec ?? fallbackRest,
  };
}

export async function setExerciseSettings(exerciseId, patch) {
  const existing = (await dbGet('exerciseSettings', exerciseId)) || { exerciseId };
  await dbPut('exerciseSettings', { ...existing, ...patch, exerciseId });
}

export async function getExerciseRecord(date, exerciseId) {
  return dbGet('workoutLogs', recordKey(date, exerciseId));
}

export async function getLastPerformance(exerciseId, beforeDate) {
  const all = await dbGetAllByIndex('workoutLogs', 'byExercise', exerciseId);
  const prior = all
    .filter((r) => r.date < beforeDate && r.sets && r.sets.length)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return prior[0] || null;
}

let lastAction = null; // { key, previous } for undo

export async function logSet(date, session, week, exercise, setIndex, setData) {
  const key = recordKey(date, exercise.id);
  const existing = (await dbGet('workoutLogs', key)) || {
    id: key, date, session, week, exerciseId: exercise.id, exerciseName: exercise.name, sets: [], rpe: null, painFlag: null, painNote: null,
  };
  const prevSnapshot = { ...existing, sets: existing.sets.map((s) => (s ? { ...s } : s)) };
  const sets = existing.sets.slice();
  while (sets.length <= setIndex) sets.push(null);
  sets[setIndex] = { ...setData, loggedAt: Date.now() };
  const updated = { ...existing, sets };
  await dbPut('workoutLogs', updated);
  lastAction = { key, previous: prevSnapshot, hadRecordBefore: !!existing.sets.length || existing.rpe || existing.painFlag };
  return updated;
}

export async function removeSet(date, exercise, setIndex) {
  const key = recordKey(date, exercise.id);
  const existing = await dbGet('workoutLogs', key);
  if (!existing) return null;
  const prevSnapshot = { ...existing, sets: existing.sets.map((s) => (s ? { ...s } : s)) };
  const sets = existing.sets.slice();
  sets[setIndex] = null;
  const updated = { ...existing, sets };
  await dbPut('workoutLogs', updated);
  lastAction = { key, previous: prevSnapshot };
  return updated;
}

export async function addExtraSet(date, session, week, exercise) {
  const key = recordKey(date, exercise.id);
  const existing = (await dbGet('workoutLogs', key)) || {
    id: key, date, session, week, exerciseId: exercise.id, exerciseName: exercise.name, sets: [], rpe: null, painFlag: null, painNote: null,
  };
  const sets = existing.sets.slice();
  sets.push(null);
  const updated = { ...existing, sets };
  await dbPut('workoutLogs', updated);
  return updated;
}

export async function setRpe(date, session, week, exercise, rpe) {
  const key = recordKey(date, exercise.id);
  const existing = (await dbGet('workoutLogs', key)) || {
    id: key, date, session, week, exerciseId: exercise.id, exerciseName: exercise.name, sets: [], rpe: null, painFlag: null, painNote: null,
  };
  const updated = { ...existing, rpe };
  await dbPut('workoutLogs', updated);
  return updated;
}

export async function setPain(date, session, week, exercise, painFlag, painNote) {
  const key = recordKey(date, exercise.id);
  const existing = (await dbGet('workoutLogs', key)) || {
    id: key, date, session, week, exerciseId: exercise.id, exerciseName: exercise.name, sets: [], rpe: null, painFlag: null, painNote: null,
  };
  const updated = { ...existing, painFlag, painNote };
  await dbPut('workoutLogs', updated);
  return updated;
}

export async function undoLastSet() {
  if (!lastAction) return false;
  await dbPut('workoutLogs', lastAction.previous);
  lastAction = null;
  return true;
}

export function clearUndo() {
  lastAction = null;
}

// ---- carry-forward exercise notes (separate from per-session pain/notes) ----
export async function getExerciseNote(exerciseId) {
  const row = await dbGet('exerciseNotes', exerciseId);
  return row?.text || '';
}

export async function setExerciseNote(exerciseId, text) {
  await dbPut('exerciseNotes', { exerciseId, text, updatedAt: Date.now() });
}
