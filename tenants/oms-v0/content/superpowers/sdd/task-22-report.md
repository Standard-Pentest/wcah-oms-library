# Task 22 Report: Final verification, README, acceptance walkthrough

## Summary

Ran the full test suite and production build (both clean), executed all six
acceptance-walkthrough beats from the spec in a real browser against a
running dev server, found and fixed one real bug along the way (printable
publish grid was keyed by display name instead of Paylocity name, contrary
to the design spec), wrote `README.md` verbatim per the brief, and committed
both changes separately.

## Environment note (read this first)

The task said to start the dev server via the browser-preview tool's launch
config `wcah-scheduler` and not via a raw shell command. That tool
(`mcp__Claude_Browser__preview_start`) turned out to be pinned to a fixed
project root — every call with `name: "wcah-scheduler"` silently resolved
to the *sibling* `prototype` project's `wcah-portal` config instead
(`cwd: /Users/hinchk/WestCoast.Vet/prototype`, port 5173), regardless of the
name requested. Confirmed via `preview_logs` showing `wcah-portal@0.1.0 dev`.
Stopped that server and, per advisor guidance, started the scheduler's own
`npm run dev` with Bash `run_in_background` (port 5174, matching
`vite.config.js`), then attached the browser pane via
`preview_start({url: "http://localhost:5174"})`, which does not consult
launch.json. This satisfies the intent of the rule (browser-driven
verification, non-blocking) while working around a real tool defect. For
most of the interactive walkthrough I switched to the
`mcp__plugin_chrome-devtools-mcp` tools instead, because they can save
screenshots directly to disk (`take_screenshot({filePath})`) and support
`upload_file`/`handle_dialog`, which the primary browser-pane tool does not
expose — both instances loaded the same `http://localhost:5174` dev server.

Also found and cleared **stale IndexedDB state** left over from a prior,
unrelated session in the same browser profile (the app landed on Week Board
instead of Dashboard, with two soft violations instead of the seeded one).
Wiped `indexedDB.deleteDatabase('wcah-scheduler')` before Beat 1 to get a
genuine first-run state — this incidentally exercises the same wipe
mechanism Beat 6 asks for.

## Step 1 — full suite and build

```
$ rtk proxy npx vitest run
 RUN  v4.1.10 /Users/hinchk/WestCoast.Vet/scheduler
 Test Files  25 passed (25)
      Tests  88 passed (88)
   Duration  972ms
```

88/88 green, pristine, before any changes.

```
$ rtk proxy npm run build
vite v6.4.3 building for production...
✓ 58 modules transformed.
dist/index.html                   0.40 kB │ gzip:  0.27 kB
dist/assets/index-BZSmv8eg.css   26.31 kB │ gzip:  5.21 kB
dist/assets/index-N6z4nAeH.js   246.44 kB │ gzip: 76.92 kB
✓ built in 324ms
```

Clean production build.

After the Publish-screen bug fix (Step 2, Beat 5), re-ran both:

```
$ rtk proxy npx vitest run
 Test Files  25 passed (25)
      Tests  89 passed (89)
$ rtk proxy npm run build
✓ 58 modules transformed.
dist/assets/index-D8teOcrZ.js   246.44 kB │ gzip: 76.93 kB
✓ built in 343ms
```

89/89 green (88 + 1 new regression test), build still clean.

## Step 2 — browser acceptance walkthrough (spec §6)

| Beat | Result | What I observed |
|---|---|---|
| 1. Dashboard first load | **PASS** | Fresh IndexedDB → Dashboard. Four week cards (Aug 2/9/16/23). Decision queue: Pearl, Leanne (submitted 2026-06-19) listed before Rodriguez, Glenda (submitted 2026-07-06), both showing `+1 gap(s) if granted · +1 hard`. Equity tile `WEEKEND EQUITY (GINI) 0.49`; Hours tile populated with Alonzo -20h, Escalante -22h, Gallegos -10.5h, Gardner -16h. Verified via `get_page_text`/accessibility snapshot, not fixtures. |
| 2. Week of Aug 2 board | **PASS** | Gardner, Theresa: Sun/Mon/Tue all `UNPAID OFF` (three cells). Gallegos, Angie Tue = `VA (until 5 PM)`. Corneau Lopez, Michaela Tue = `Tech NC · until 1:00 PM`. Coverage strip: Thu status `OVER +1`, all other days `ON TARGET`. Rail: exactly one violation, `SOFT — Gardner, Theresa is 16h under their 40h standard. Unpaid time off — makeup shifts owed.` |
| 3. Time Off import → react | **PASS** | Pasted a new Paylocity row (`Hobbs, Keith`, Approved, 08/02/2026, 0 hrs, 1 day) into the Time Off screen. Preview classified it `UNPAID`, matched to `hobbs-keith`. Applied. On the Week of Aug 2 board, Hobbs' Sunday cell flipped `VA → UNPAID OFF`; VA coverage on Sun dropped `5/5 ON TARGET → 4/5 SHORT 1`; a new `HARD — VA short 1 on Sun` violation and a new `SOFT — Hobbs, Keith is 10h under standard` violation appeared. |
| 4. Hard violation → pull-order repair | **PASS** | Set Prado, Carla's Tue RVT cell to `OFF` on the board. `HARD — RVT short 1 on Tue (2 of 3). Weekday RVT split...` appeared immediately; coverage strip Tue RVT `3/3 → 2/3 SHORT 1`. Rail suggested repairs in pull order (`Add Dimino, Aaron to RVT on Tue`, `Add Prado, Carla to RVT on Tue`, `Add Sharko, Chloe to RVT on Tue`, each badged `gaps -1 · hard -1`). Applied the top suggestion (Dimino) — Tue RVT strip returned to `3/3 ON TARGET`, the hard violation disappeared; impact matched the badge exactly (one new `INFO` overtime note appeared as an honest side effect of Dimino's added hours, not a repair failure). |
| 5. Week of Aug 9 rotations → Publish | **PASS** (after one fix) | Read toggle button `active` state directly from the DOM (not from fixtures): `Willis, Bree · Sun · HSS` → ON; `Paz, Vero · Sun · VA` → ON; `Paz, Vero · Fri · VA` → OFF. Matches the spec's cadence math (Bree every-other-week anchor 2026-07-26 → ON in week of Aug 9; Vero every-3rd anchor 2026-07-19 → ON, with the linked Fri-OFF-when-Sun-ON effect). Clicked "Confirm rotations" — the `rotations unconfirmed` badge disappeared. On the Publish screen: intercepted the `Download CSV` blob and confirmed it is keyed by Paylocity name (`"Paz, Veronica"`, `"Willis, Breanne"`, `"Cuevas Minjarez, Paulina"`, etc.) — correct as built. **But** the on-screen/printable grid (same table `window.print()` prints) rendered `staff.displayName` (`"Paz, Vero"`) instead of `staff.paylocityName`. See "Bug found and fixed" below. |
| 6. Reload / wipe / export / import | **PASS** (adapted) | Reload alone: confirmed full state persistence (edits from beats 3–5, screen, and selected week all survived a page reload) before doing the destructive test. Full destructive cycle: intercepted `Export JSON backup`'s Blob and saved it to disk (24,517 bytes, valid JSON, 28 roster entries, 10 requests including the Beat-3 import, all four weeks with their overrides/toggle states). Wiped the database with `indexedDB.deleteDatabase('wcah-scheduler')` — the exact operation DevTools' Application → IndexedDB → Delete performs, executed in-page since I could not reach a DevTools UI panel directly. Reloaded: app reseeded to a fresh Dashboard (Week of Aug 9 back to `5 gaps · 5 hard · 3 soft, provisional`, confirming a true reseed, not an accidental restore). Used the file input on the Publish screen (`upload_file` on the "Import JSON backup" control, then accepted the native `confirm()` dialog) to import the saved backup. Verified restoration at a granular level, not just "app looks normal": Hobbs, Keith Sun cell back to `UNPAID OFF`; Prado, Carla's Tue cell back to empty (her manual OFF override); Dimino, Aaron's Tue cell back to `RVT` (the applied repair); Aug 9's rotation-confirmed state (no "unconfirmed" badge) intact. |

### What I could/could not verify precisely for Beat 6

- **Could verify:** the full export → wipe → reseed → import cycle, functionally identical to the DevTools Application panel path (same `indexedDB.deleteDatabase()` call DevTools issues), with before/after `indexedDB.databases()` checks and granular data-level restoration checks (not just "no error shown").
- **Could not verify:** clicking through the actual Chrome DevTools **Application** panel UI itself — no direct devtools-panel-UI automation was available in this environment. I used the JS-level equivalent instead, which exercises the same code path (`IDBFactory.deleteDatabase`) that the DevTools button calls.

## Bug found and fixed

**Printable publish grid was keyed by display name, not Paylocity name.**

- `docs/superpowers/specs/2026-07-24-wcah-scheduler-mvp-design.md:111` and
  `:275` both specify: "Per-week: printable schedule grid + CSV keyed by
  Paylocity name" / "CSV + printable grid keyed by Paylocity names" — the
  requirement applies to *both* outputs.
- `src/ui/exporters.js`'s `weekCsv()` already did this correctly
  (`s.paylocityName`).
- `src/ui/PublishScreen.jsx`'s on-screen/print `<table>` (the same table
  `window.print()` prints) rendered `s.displayName` instead — e.g. `"Paz,
  Vero"` on screen vs. `"Paz, Veronica"` in the CSV, disagreeing on the
  Paylocity match key. Confirmed by capturing the actual `Download CSV`
  Blob content live from the running app and diffing it against the visible
  table text.

Fixed with TDD:
1. Added a failing test to `src/ui/PublishScreen.test.jsx` asserting the
   printable grid shows `"Paz, Veronica"` (Paylocity name) and not `"Paz,
   Vero"` (display name) — confirmed RED.
2. Changed `src/ui/PublishScreen.jsx` line 89 from `{s.displayName}` to
   `{s.paylocityName}` — confirmed GREEN, full suite still green (89/89),
   build still clean.
3. Reloaded the live app and re-verified in the DOM: printable grid now
   shows `"Cuevas Minjarez, Paulina"`, `"Gallegos, Angela"`, `"Paz,
   Veronica"`, `"Willis, Breanne"`, etc.

Committed separately (before the README commit), with its own message.

## Screenshots

All under `.superpowers/sdd/screenshots/` (gitignored, kept for this
report only):

- `beat1-dashboard.png` — fresh first-run Dashboard
- `beat2-week-aug02-board.png` — Week of Aug 2 full board + coverage strip
- `beat3-timeoff-applied.png` — Time Off preview/apply
- `beat3-week-reacted.png` — Aug 2 board after Hobbs' Sunday flips to UNPAID OFF, VA strip SHORT 1
- `beat4-hard-violation.png` — Prado's Tue OFF triggers the RVT hard violation + pull-order suggestions
- `beat4-repaired.png` — after applying Dimino → RVT on Tue, strip clears
- `beat5-week-aug09-loaded.png` — Week of Aug 9 initial (unconfirmed) load
- `beat5-rotation-toggles.png` — Week Setup panel, rotation toggles list
- `beat5-rotations-confirmed.png` — after "Confirm rotations", badge gone
- `beat5-publish-csv-paylocity.png` — Publish screen after the fix, Paylocity names in the printable grid
- `beat6-wiped-reseeded.png` — Dashboard immediately after IndexedDB wipe + reload (fresh reseed)

## Step 3 — README.md

Written verbatim per the brief to `/Users/hinchk/WestCoast.Vet/scheduler/README.md`.
Verified both referenced docs exist:
`docs/superpowers/specs/2026-07-24-wcah-scheduler-mvp-design.md` and
`docs/superpowers/plans/2026-07-24-wcah-scheduler-mvp.md`.

## Step 4 — commits

```
47fc315 docs: README with run instructions and trust anchor
bacff72 fix(ui): key the printable publish grid by Paylocity name
```

Both include the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

## Notes for the caller (no unresolved functional gaps)

- The browser-preview tool's launch-config resolution (`name` parameter)
  cannot be trusted in this environment when more than one sibling project
  has a `.claude/launch.json` — it silently serves the wrong project. Worth
  flagging to whoever owns that tooling; I worked around it rather than
  silently trusting it (see "Environment note" above).
- Beat 6's literal instruction ("wipe via devtools → Application →
  IndexedDB") was satisfied functionally (same underlying browser API call)
  but not via the literal DevTools panel UI, since no devtools-panel-click
  automation was available. I consider this equivalent, not a downgrade,
  but flagging per the brief's own escape-hatch clause.
- One real bug found and fixed outside the original 21-task scope
  (Task 21's own brief had specified `displayName` for the print table,
  which is why it passed that task's review — the deviation from the
  design spec was only visible once beat 5's exact wording was checked
  against both outputs side by side).

Status: **DONE**. No unresolved functional gaps — all six beats pass, full
suite (89/89) and build are clean, the one bug found was fixed with a
regression test, and the items above are process/environment notes for the
caller, not open issues.
