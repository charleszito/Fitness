// First-run import: seeds IndexedDB with the weeks 1-2 data pulled from the
// source workbook, plus default settings.
import { metaGet, metaSet, dbPut, dbGet } from './db.js';
import { SEED_LOGGED } from './data/seed-logged.js';
import { SESSIONS, DEFAULT_PROTEIN_TARGET_G } from './data/program.js';

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function findExercise(session, name) {
  const list = SESSIONS[session] || [];
  return list.find((e) => e.name === name) || list.find((e) => e.id === slug(name));
}

export async function runFirstRunImportIfNeeded() {
  const done = await metaGet('importDone', false);
  if (done) return false;

  // settings
  await metaSet('proteinTargetG', DEFAULT_PROTEIN_TARGET_G);
  await metaSet('wakeLockEnabled', true);
  await metaSet('units', 'metric');

  // workout logs
  for (const w of SEED_LOGGED.workoutLogs) {
    const exercise = findExercise(w.session, w.exercise);
    if (!exercise) continue;
    const sets = w.sets.map((s) => (s.w == null && s.reps == null ? null : { w: s.w, reps: s.reps, loggedAt: null }));
    const key = `${w.date}__${exercise.id}`;
    // "pain" column in the workbook doubles as a free note in this data (e.g.
    // "Sit tail tucked, and core engaged") — treat non Y/N text as a carried note.
    let painFlag = null;
    let painNote = null;
    if (w.pain === 'Y' || w.pain === 'N') {
      painFlag = w.pain;
    } else if (w.pain) {
      painNote = w.pain.trim();
      await dbPut('exerciseNotes', { exerciseId: exercise.id, text: painNote, updatedAt: Date.now() });
    }
    await dbPut('workoutLogs', {
      id: key,
      date: w.date,
      session: w.session,
      week: w.week,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      sets,
      rpe: w.rpe ?? null,
      painFlag,
      painNote,
    });
  }

  // daily logs (weight etc.)
  for (const d of SEED_LOGGED.dailyLogs) {
    const existing = await dbGet('dailyLogs', d.date);
    await dbPut('dailyLogs', {
      date: d.date,
      week: d.week,
      session: d.session,
      weightKg: d.weight ?? null,
      steps: d.steps ?? null,
      sessionDone: d.sessionDone === 'Y' ? true : d.sessionDone === 'N' ? false : null,
      cardioDone: d.cardioDone === 'Y' ? true : d.cardioDone === 'N' ? false : null,
      ankleFasciaDone: d.ankleDone === 'Y' ? true : d.ankleDone === 'N' ? false : null,
      notes: d.notes ?? null,
      ...(existing || {}),
    });
  }

  // warmup logs
  for (const wu of SEED_LOGGED.warmupLogs) {
    const key = `${wu.date}__${slug(wu.item)}`;
    await dbPut('warmupLogs', {
      id: key,
      date: wu.date,
      week: wu.week,
      session: wu.session,
      item: wu.item,
      done: wu.done === 'Y' ? true : wu.done === 'N' ? false : null,
      notes: wu.notes ?? null,
    });
  }

  await metaSet('importDone', true);
  await metaSet('importedAt', Date.now());
  return true;
}
