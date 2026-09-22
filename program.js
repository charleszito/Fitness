// Canonical program data extracted & cleaned from the source workbook.
// This is reference/static data — the user's actual logs live in IndexedDB.

export const PLAN_START_DATE = '2026-09-14'; // Mon, Week 1 Day 1
export const PLAN_WEEKS = 8;
export const DEFAULT_PROTEIN_TARGET_G = 185; // fixes the 190/185/180 three-way conflict
export const EATING_WINDOW = { start: '12:00', end: '20:00' };

// Weekday (0=Sun..6=Sat) -> session name
export const WEEKLY_CYCLE = {
  1: 'Upper A',       // Mon
  2: 'Lower A',       // Tue
  3: 'Zone-2 Cardio',  // Wed
  4: 'Upper B',       // Thu
  5: 'Lower B',       // Fri
  6: 'Cardio Intervals', // Sat
  0: 'Rest',          // Sun
};

export const LIFTING_SESSIONS = ['Upper A', 'Lower A', 'Upper B', 'Lower B'];

// Steps target ramps by week
export const STEPS_TARGETS = [10000, 10000, 12000, 12000, 15000, 15000, 15000, 15000];

// Milestones sheet, verbatim
export const MILESTONES = [
  { week: 1, targetWeightKg: 96,   stepsTarget: 10000, focus: 'Learn movements, find working weights (RPE 7)' },
  { week: 2, targetWeightKg: 94.5, stepsTarget: 10000, focus: 'Working weights set' },
  { week: 3, targetWeightKg: 93.5, stepsTarget: 12000, focus: 'Add load/reps, RPE 8' },
  { week: 4, targetWeightKg: 92.5, stepsTarget: 12000, focus: '+5-10% on all main lifts' },
  { week: 5, targetWeightKg: 91.5, stepsTarget: 15000, focus: '4 sets on first two lifts/session' },
  { week: 6, targetWeightKg: 91,   stepsTarget: 15000, focus: '4 sets on main lifts, RPE 8-9' },
  { week: 7, targetWeightKg: 90,   stepsTarget: 15000, focus: 'Continue progression' },
  { week: 8, targetWeightKg: 89.5, stepsTarget: 15000, focus: 'Deload (2 sets, RPE 6), re-test, plan block 2' },
];

// Fix #3: derive each week's prescribed sets from Milestones rather than the
// workbook's flat "3x" target strings (which never changed across weeks).
// weeks 5-7: first two exercises of each session (the "main" category) get 4 sets.
// week 8: deload — every exercise drops to 2 sets.
export function prescribedSets(week, exercise) {
  const base = exercise.sets;
  if (week >= 8) return Math.min(base, 2);
  if (week >= 5 && week <= 7 && exercise.category === 'main') return 4;
  return base;
}

export function rpeGuidance(week) {
  if (week <= 2) return 'RPE 7';
  if (week <= 4) return 'RPE 8';
  if (week <= 6) return 'RPE 8-9';
  if (week === 7) return 'RPE 8-9 (continue progression)';
  return 'RPE 6 (deload)';
}

const REST_BY_CATEGORY = { main: 150, secondary: 120, isolation: 75, core: 45 };

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// target string parser: "3x8-10", "3x10/side", "3x30s/side", "3x40s", "2x8-10/leg"
export function parseTarget(target) {
  const m = target.match(/^(\d+)x(\d+)(?:-(\d+))?(s)?(\/side|\/leg)?$/);
  if (!m) return { sets: 3, repsMin: null, repsMax: null, timed: false, perSide: false };
  const [, sets, lo, hi, sSuffix, sideSuffix] = m;
  return {
    sets: parseInt(sets, 10),
    repsMin: parseInt(lo, 10),
    repsMax: hi ? parseInt(hi, 10) : parseInt(lo, 10),
    timed: !!sSuffix,
    perSide: !!sideSuffix,
  };
}

function ex(name, target, category, opts = {}) {
  const parsed = parseTarget(target);
  return {
    id: slug(name),
    name,
    target,
    ...parsed,
    category, // main | secondary | isolation | core
    restSec: opts.restSec ?? REST_BY_CATEGORY[category],
    hasWeight: opts.hasWeight ?? (category !== 'core'),
    unit: opts.unit ?? 'kg',
    increment: opts.increment ?? (opts.unit === 'stack' ? 5 : 2.5),
    isAssisted: opts.isAssisted ?? false,
  };
}

const CORE_UPPER = [
  ex('Core - Dead bug', '3x10/side', 'core'),
  ex('Core - Side plank', '3x30s/side', 'core'),
  ex('Core - Pallof press', '3x12/side', 'core'),
];
const CORE_LOWER = [
  ex('Core - Front plank', '3x40s', 'core'),
  ex('Core - Bird dog', '3x8/side', 'core'),
  ex('Core - Hanging knee raise', '3x10', 'core'),
];

export const SESSIONS = {
  'Upper A': [
    ex('Flat DB bench press', '3x8-10', 'main', { unit: 'kg' }),
    ex('Chest-supported row', '3x10-12', 'main', { unit: 'stack' }),
    ex('Seated DB shoulder press', '3x8-10', 'secondary', { unit: 'kg' }),
    ex('Lat pulldown', '3x10-12', 'secondary', { unit: 'stack' }),
    ex('Cable lateral raise', '2x12-15', 'isolation', { unit: 'stack', increment: 2.5 }),
    ex('Face pull', '2x15', 'isolation', { unit: 'stack', increment: 2.5 }),
    ex('Incline DB curl', '2x12', 'isolation', { unit: 'kg' }),
    ex('Rope pushdown', '2x12', 'isolation', { unit: 'stack', increment: 2.5 }),
    ...CORE_UPPER,
  ],
  'Lower A': [
    ex('Leg press', '3x10-12', 'main', { unit: 'stack' }),
    ex('Goblet squat', '3x8-10', 'main', { unit: 'kg' }),
    ex('Seated leg curl', '3x12', 'secondary', { unit: 'stack' }),
    ex('Bulgarian split squat', '2x8-10/leg', 'secondary', { unit: 'kg' }),
    ex('Leg extension', '2x15', 'isolation', { unit: 'stack' }),
    ex('Seated calf raise', '3x15', 'isolation', { unit: 'stack' }),
    ...CORE_LOWER,
  ],
  'Upper B': [
    ex('Incline DB press', '3x8-10', 'main', { unit: 'kg' }),
    ex('Pull-up / assisted pull-up', '3x6-10', 'main', { unit: 'kg', isAssisted: true }),
    ex('Seated cable row', '3x10-12', 'secondary', { unit: 'stack' }),
    ex('Machine shoulder press', '3x10', 'secondary', { unit: 'stack' }),
    ex('Cable fly', '2x12-15', 'isolation', { unit: 'stack', increment: 2.5 }),
    ex('Rear delt fly', '2x15', 'isolation', { unit: 'stack', increment: 2.5 }),
    ex('Hammer curl', '2x12', 'isolation', { unit: 'kg' }),
    ex('Overhead cable extension', '2x12', 'isolation', { unit: 'stack', increment: 2.5 }),
    ...CORE_UPPER,
  ],
  'Lower B': [
    ex('Romanian deadlift', '3x8-10', 'main', { unit: 'kg' }),
    ex('Hip thrust', '3x10-12', 'main', { unit: 'kg' }),
    ex('Hack squat', '3x10-12', 'secondary', { unit: 'stack' }),
    ex('Lying leg curl', '3x12-15', 'secondary', { unit: 'stack' }),
    ex('Low-box step-up', '2x10/leg', 'isolation', { unit: 'kg' }),
    ex('Adductor machine', '2x15', 'isolation', { unit: 'stack' }),
    ex('Back extension', '2x12', 'isolation', { unit: 'stack', increment: 2.5 }),
    ...CORE_LOWER,
  ],
};

export const WARMUP_LISTS = {
  upper: [
    { item: '5 min easy bike', target: '5 min' },
    { item: 'Band pull-aparts', target: '15 reps' },
    { item: 'Arm circles (both directions)', target: '10 each way' },
    { item: 'Scapular push-ups', target: '10 reps' },
    { item: 'Cat-cow', target: '8 reps' },
    { item: 'Thoracic rotations', target: '8/side' },
    { item: 'Ramp sets on first lift (50%x8, 75%x5)', target: '2 sets' },
  ],
  lower: [
    { item: '5 min easy bike', target: '5 min' },
    { item: 'Cat-cow', target: '8 reps' },
    { item: 'Glute bridge', target: '15 reps' },
    { item: 'Bodyweight squat (pain-free depth)', target: '10 reps' },
    { item: 'Ankle rocks', target: '10/side' },
    { item: 'Leg swings', target: '10/side' },
    { item: '90/90 hip switch', target: '6/side' },
    { item: 'Ramp sets on first lift (50%x8, 75%x5)', target: '2 sets' },
  ],
};

export function warmupListFor(session) {
  if (session === 'Upper A' || session === 'Upper B') return WARMUP_LISTS.upper;
  if (session === 'Lower A' || session === 'Lower B') return WARMUP_LISTS.lower;
  return [];
}

export const STRETCH_LISTS = {
  upperCooldown: [
    { item: 'Doorway pec stretch', target: '45s/side' },
    { item: 'Lat stretch on rack', target: '45s/side' },
    { item: 'Cross-body shoulder stretch', target: '30s/side' },
    { item: "Child's pose", target: '60s' },
  ],
  lowerCooldown: [
    { item: 'Couch stretch', target: '60s/side' },
    { item: '90/90 hip stretch', target: '60s/side' },
    { item: 'Standing hamstring stretch', target: '45s/side' },
    { item: 'Calf stretch on step', target: '45s/side' },
  ],
  wedMobility: [
    { item: 'Couch stretch', target: '60s/side' },
    { item: '90/90 hip switches', target: '8/side' },
    { item: 'Pigeon stretch', target: '60s/side' },
    { item: 'Cat-cow', target: '10 reps' },
    { item: 'Deep squat hold', target: '3x30s' },
    { item: 'Hamstring floss', target: '10/side' },
    { item: 'Wall slides', target: '10 reps' },
    { item: 'Thoracic rotation', target: '8/side' },
  ],
  satMobility: [
    { item: 'Couch stretch', target: '60s/side' },
    { item: '90/90 hip switches', target: '8/side' },
    { item: 'Pigeon stretch', target: '60s/side' },
    { item: 'Hamstring floss', target: '10/side' },
    { item: 'Calf stretch on step', target: '45s/side' },
  ],
  sunMobility: [
    { item: 'Couch stretch', target: '60s/side' },
    { item: '90/90 hip switches', target: '8/side' },
    { item: 'Cat-cow', target: '10 reps' },
    { item: "Child's pose", target: '60s' },
  ],
};

export function stretchListFor(session) {
  if (session === 'Upper A' || session === 'Upper B') return STRETCH_LISTS.upperCooldown;
  if (session === 'Lower A' || session === 'Lower B') return STRETCH_LISTS.lowerCooldown;
  if (session === 'Zone-2 Cardio') return STRETCH_LISTS.wedMobility;
  if (session === 'Cardio Intervals') return STRETCH_LISTS.satMobility;
  if (session === 'Rest') return STRETCH_LISTS.sunMobility;
  return [];
}

export const MEAL_PLAN = {
  eatingWindow: '12pm-8pm. Water/black coffee/tea only outside it.',
  dailyTargets: { kcal: 2050, proteinG: DEFAULT_PROTEIN_TARGET_G, fibreG: 30, waterL: 3 },
  meals: [
    { slot: 'Meal 1', time: '~12:30pm', kcal: 850, proteinG: 70 },
    { slot: 'Snack', time: '~3:30-4pm', kcal: 450, proteinG: 50 },
    { slot: 'Meal 2', time: '~6:30-7pm', kcal: 750, proteinG: 65 },
  ],
  foodTable: [
    { food: 'Chicken breast/thigh', proteinPer100g: 28, kcalPer100g: 165 },
    { food: 'Beef (lean cut)', proteinPer100g: 26, kcalPer100g: 215 },
    { food: 'Egg, 1 large (~50g)', proteinPer100g: 6, kcalPer100g: 75 },
    { food: 'Greek-style yogurt, plain', proteinPer100g: 9, kcalPer100g: 60 },
    { food: 'Brown rice', proteinPer100g: 2.5, kcalPer100g: 110 },
    { food: 'Ofada rice', proteinPer100g: 2.5, kcalPer100g: 130 },
    { food: 'Sweet potato, boiled', proteinPer100g: 1.5, kcalPer100g: 90 },
    { food: 'Unripe plantain, boiled', proteinPer100g: 1, kcalPer100g: 120 },
    { food: 'Leafy greens, 1 cup', proteinPer100g: 3, kcalPer100g: 40 },
  ],
  shoppingList: [
    { category: 'Protein', items: 'Chicken breast/thigh 1.2-1.5kg | Beef 1.2kg | Eggs 18-20 | Plain Greek yogurt ~1.5kg' },
    { category: 'Carbs', items: 'Brown rice 500g | Ofada rice 500g | Sweet potato 1.2kg | Unripe plantain 6-8 fingers' },
    { category: 'Veg', items: 'Ugu/spinach 2 bunches | Cucumber 4-5 | Tomatoes 10-12 | Onions 4-5 | Cabbage 1 | Peppers small handful' },
    { category: 'Pantry/spices', items: 'Suya spice | Tomato paste | Stock cubes, ginger, garlic | Light oil | Fruit (banana/pawpaw) 5-6' },
  ],
  rules: [
    'Protein first on the plate before carbs.',
    'Grill/boil/steam over frying - light oil only.',
    'Sauces built on tomato/pepper/onion, not oil or sugar.',
    "Genuinely hungry on a lifting day? Add to the snack before touching Meal 2's carbs.",
    'If the Weekly Summary shows a 14+ day weight stall, trim ~30g off a Meal 2 carb portion before touching protein.',
  ],
};

// Planned meals per date, from the Meal Log sheet (same weekly rotation each week)
export const PLANNED_MEALS_BY_WEEKDAY = {
  1: { // Mon
    'Meal 1': 'Grilled chicken (200g) + brown rice (150g) + ugu/spinach',
    'Snack': 'Greek yogurt (200g) + 1 boiled egg',
    'Meal 2': 'Beef stew (180g) + sweet potato (200g) + veg salad',
  },
  2: { // Tue
    'Meal 1': 'Suya beef (180g) + ofada rice (150g) + steamed greens',
    'Snack': '2 boiled eggs + cucumber & tomato',
    'Meal 2': 'Chicken pepper-soup style (200g) + plantain (200g) + veg',
  },
  3: { // Wed
    'Meal 1': 'Grilled chicken (180g) + sweet potato (200g) + salad',
    'Snack': 'Greek yogurt (200g) + fruit',
    'Meal 2': 'Beef (180g) + brown rice (150g) + veg',
  },
  4: { // Thu
    'Meal 1': 'Beef (180g) + ofada rice (150g) + veg',
    'Snack': '2 boiled eggs + small yogurt (100g)',
    'Meal 2': 'Chicken (200g) + plantain (200g) + veg',
  },
  5: { // Fri
    'Meal 1': 'Chicken (200g) + sweet potato (200g) + veg',
    'Snack': 'Greek yogurt (200g) + 1 boiled egg',
    'Meal 2': 'Beef (180g) + brown rice (150g) + veg',
  },
  6: { // Sat
    'Meal 1': 'Beef (180g) + ofada rice (150g) + veg',
    'Snack': 'Greek yogurt (200g) + fruit',
    'Meal 2': 'Chicken (200g) + plantain (200g) + veg',
  },
  0: { // Sun
    'Meal 1': 'Flexible - leftovers before new batch',
    'Snack': 'Greek yogurt (200g)',
    'Meal 2': '3-egg veg omelette + sweet potato (150g)',
  },
};

// Blocks: block 1 is the fixed 8-week template from the source workbook.
// The Plan screen can append further blocks (e.g. Block 2 after the week 8
// deload/re-test), each reusing the same weekly template with new dates.
let BLOCKS = [{ id: 'block1', label: 'Block 1', startDate: PLAN_START_DATE, weeks: PLAN_WEEKS }];

export function setBlocks(blocks) {
  BLOCKS = blocks.length ? blocks.slice().sort((a, b) => (a.startDate < b.startDate ? -1 : 1)) : BLOCKS;
}
export function getBlocks() {
  return BLOCKS;
}
export function blockForDate(dateStr) {
  for (const b of BLOCKS) {
    const end = addDays(b.startDate, b.weeks * 7 - 1);
    if (dateStr >= b.startDate && dateStr <= end) return b;
  }
  // fall back to the block whose start is closest in the past, or the first block
  const past = BLOCKS.filter((b) => b.startDate <= dateStr);
  return past[past.length - 1] || BLOCKS[0];
}

export function dateToWeek(dateStr) {
  const block = blockForDate(dateStr);
  const start = new Date(block.startDate + 'T00:00:00');
  const d = new Date(dateStr + 'T00:00:00');
  const diffDays = Math.round((d - start) / 86400000);
  return Math.min(block.weeks, Math.max(1, Math.floor(diffDays / 7) + 1));
}

export function sessionForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekday = d.getDay();
  return WEEKLY_CYCLE[weekday];
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayStr(overrideDate) {
  const d = overrideDate ? new Date(overrideDate) : new Date();
  return d.toISOString().slice(0, 10);
}
