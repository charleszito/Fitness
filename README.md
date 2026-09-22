# Gym Tracker — Install & Use

This is a fully offline-first PWA built from your 8-week tracker workbook. It has no
backend — everything lives on your device in IndexedDB, and it works in airplane mode
once installed.

## 1. Host the files (required for "Add to Home Screen")

A zip can't be installed as a PWA by itself — iOS/iPadOS only offers "Add to Home
Screen" for a page loaded over HTTPS from a real web address. Pick any static host:

- **GitHub Pages** — create a repo, upload everything in this folder, enable Pages
  in Settings → Pages, pointing at the branch/root.
- **Netlify / Vercel** — drag-and-drop this folder onto their web dashboard (Netlify
  has a literal "drag folder here to deploy" box); no build step needed, it's static
  files.
- **Cloudflare Pages** — same idea, direct upload, no build command.

All of these are free for a single small static site. Whichever you use, keep the
folder structure exactly as-is (index.html at the root, css/js/icons alongside it).

## 2. Install on iPhone / iPad

1. Open the hosted URL in **Safari** (must be Safari, not Chrome, for iOS install).
2. Tap the Share icon → **Add to Home Screen** → Add.
3. Launch it from the home screen icon from now on — it opens full-screen, no
   Safari chrome, and works offline after the first load.

## 3. First launch

On first open it automatically imports your Weeks 1–2 data from the workbook
(sets, weights, reps, daily logs, warm-ups) — no setup step needed. From then on
everything is logged locally on your device.

## 4. Data fixes applied vs. the original workbook

- **Protein target**: unified to a single 185g/day target (was inconsistently
  190/185/180g across sheets) — editable in Plan → Settings.
- **Steps "target hit"**: now compares each day against that week's own ramped
  target (10k → 12k → 15k per the Milestones sheet), not a flat 10,000.
- **Set counts**: Active Workout now derives prescribed sets from the Milestones
  sheet (4 sets on the first two lifts in weeks 5–7, deload to 2 sets in week 8)
  instead of the workbook's static "3x" text.
- **Weight units**: each exercise has its own unit (kg default for bodyweight/DB
  work, "stack" for machine/cable numbers) — change it once per exercise in its
  settings sheet; progression charts never mix units.
- **Assisted pull-ups**: still logged as negative weight (assist amount), now
  clearly labeled "assist" in the UI so it doesn't read as an error.

## 5. Backing up / moving data

Plan → Data lets you:
- **Export .xlsx** — rebuilds the same sheet structure as your original workbook
  (Weekly Summary, Milestones, Daily Log, Meal Log, Workout Log, etc.) with current
  data, opens cleanly in Excel/Numbers/Sheets.
- **Export JSON** — a full-fidelity backup of everything in the app.
- **Restore from JSON** — reload a JSON backup (e.g. after reinstalling, or moving
  to a new device).

There's no cloud sync, so if you want your data on a second device, use the JSON
export/import to move it over manually.

## 6. Starting Block 2

After week 8's deload, go to Plan → Blocks → "Set up next block" to duplicate the
8-week template with new dates, continuing your progression.
