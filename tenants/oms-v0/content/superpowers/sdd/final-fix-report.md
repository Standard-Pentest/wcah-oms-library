# Final whole-branch review — fix report

Branch `feature/mvp-build`, base `47fc315`. Six findings, all confirmed against
source and all fixed test-first. Four commits.

| # | Commit | Finding |
|---|--------|---------|
| 1 | `9925012` | Failed store load silently destroys saved data |
| 2 | `c562d2f` | `req.hours` is an aggregate but spent per-day and per-week |
| 3 | `a931eff` | Roster paste replaces staff wholesale, no preview |
| 4–6 | `3d68a3b` | `save()` resolves early · `'Denied'` coerced · stale adopt issues |
| — | `(hardening)` | absent-`standardHours` guard test · prototype-key hole in the status gate |

**Suite: 107 passed / 26 files, 0 failed. Build: clean. Parity: passing, untouched.**

`git diff 47fc315 --stat -- src/data/` is empty — no parity fixture and no seed
datum was changed to accommodate any fix.

---

## MUST FIX 1 — a failed store load silently destroys saved data

**Changed** — `src/state/SchedulerContext.jsx`, `src/ui/App.jsx`

`deserialize` refuses a schema mismatch precisely so data is never dropped, but
the provider caught the rejection, seeded, and let the 300ms autosave write that
seed straight over the manager's document — before she could read the banner
telling her to export. The same path ran for *any* load rejection: a
private-browsing IndexedDB block or a transient error destroyed the document too.

Added `writesEnabled`, false until the store is known safe to overwrite. It is
set by exactly two things: a clean load, or an explicit `REPLACE_STATE`. The save
effect returns early unless it is true (and lists it in its dep array rather than
relying on `state` changing). `dispatch` is now a wrapper that flips
`writesEnabled` on `REPLACE_STATE`, so a successful JSON import re-enables
writes; a new **"Discard saved data and start fresh"** control on `StorageBanner`
does the same, behind a confirm that names the overwrite, so the manager is not
stranded read-only.

A failed *save* is deliberately non-disabling — it shows a distinct `save-error`
banner and the next edit retries. One transient write error must not make the app
permanently read-only, and the discard control is hidden in that state (writes
were never gated).

**Test** — `src/state/SchedulerContext.test.jsx` (3 cases), driven through `Shell`
with a store holding a `schemaVersion: 999` document.

- RED `leaves the saved document byte-identical when the load failed`:
  `AssertionError: expected '{"schemaVersion":1,"state":{"roster":…' to be '{"schemaVersion":999,"state":{"irrepl…'`
  — the seed had already overwritten the saved document within the autosave window.
- RED `resumes saving only after the user explicitly discards the saved data`:
  no such control existed (`Unable to find role="button" name=/discard saved data/i`).
- GREEN: 3/3. `still autosaves after a healthy load` is the regression guard that
  the gate did not break normal operation; the full suite (Dashboard,
  WeekBoardEditing, PublishScreen all mount via `createMemoryStore`) stayed green.

## MUST FIX 2 — `req.hours` is an aggregate but spent per-day and per-week

**Changed** — `src/domain/timeoff.js`, `src/domain/build.js`, `src/domain/rules.js`

`classifyRequest` divided by days; no consumer did. `build.js` subtracted the
whole request from *every* covered day (a 12h/2d PARTIAL zeroed two 10h days
instead of leaving 4h each); `rules.js` credited the whole request to *any* week
it touched (seeded `req-9`, 30h/3d Fri–Sun, credits 30h to week 1 and 30h again
to week 2 once granted — reachable today through `selectDecisionQueue`, which
simulates granting it).

Added `hoursPerDay(req)` as the single daily-rate source. `build.js` subtracts
`perDay`. `undertime` now counts only the request dates falling inside the week
being evaluated and credits `hoursPerDay × daysInWeek`; `unpaidDays` is scoped the
same way for consistency (it is read as a boolean, so the makeup note is
unaffected). `classifyRequest` guards a non-positive `days` — documented as UNPAID,
the conservative read since UNPAID never credits paid hours, and inert downstream
regardless because `requestDates` then yields nothing.

**Tests** — `build.test.js` `spends a multi-day PARTIAL per day…`;
`rules.test.js` `credits a cross-week PAID request only for its days inside each
week`; `timeoff.test.js` malformed-days and rate cases.

- RED build: `expected { kind: 'shift', role: 'VA', …(2) } to match object { role: 'VA', earlyLeave: true, …(1) }` — both days at 0h.
- RED rules: `the given combination of arguments (undefined and string) is invalid` — no undertime violation raised in either week, because each had claimed the full 20h.
- RED timeoff: `expected 'PAID' to be 'UNPAID'` — `hours/0` is `Infinity`, which is `>= 8`.
- GREEN: all three.

**Parity**: every seeded PARTIAL is `days: 1`, so the daily rate equals the total
and the Aug 2 grid is bit-identical. Confirmed below.

## MUST FIX 3 — roster paste replaces staff wholesale, no preview

**Changed** — `src/import/roster-paste.js`, `src/ui/RosterScreen.jsx`, `src/ui/RailPanel.jsx`

`slug(displayName)` reproduces the seed ids exactly, so re-pasting the workbook's
own Roster sheet overwrote real staff through `UPSERT_STAFF`'s replace semantics.

**(a) Parser** now states only what the sheet states:

- `standardHours: 40` removed — the field is simply absent when unknown, so
  `undertime` (`if (!staff.standardHours) continue`) stays silent rather than
  inventing a 40h expectation for someone whose real standard is 25.5.
- `hours: 10` removed from time-noted cells.
- `CELL` now accepts the workbook's middle-dot form —
  `/^([A-Za-z_ ]+?)\s*(?:\((.+)\)|·\s*(.+))?$/` — as an alternation rather than by
  widening the role class, which would have swallowed the dot into the role name.
  `'Tech NC · until 1:00 PM'` is a TECH_NC cell again instead of falling through to
  the row role and counting Michaela toward Tuesday VA coverage.
- Role normalisation is `/\s+/g`, not `' '` (which replaced only the first space —
  the same bug class as the finding itself).

**(b) Merge, not replace.** New pure `mergeStaffRecord(existing, record)` keeps
`standardHours` and every `constraints` key the sheet does not carry, and merges
patterns per day: where the pasted role matches the existing role, the known
`hours` and exact `label` are carried forward. That is what keeps Gardner's 8h
days at 8 rather than resetting them to the 10h default, and Michaela's Tuesday
at `hours: 5.5` with its verbatim label. A record for an unknown person passes
through untouched as a new hire. **No raw parsed record reaches the store** — the
confirm handler dispatches merge output only.

**(c) UI.** `RosterPasteBox` now parses into a per-row preview table — Name, Role,
Pattern, and **CREATE vs OVERWRITE** — above the issues list, and applies nothing
until an explicit `Confirm N rows`.

Consequential: `standardHours` may now be absent, so `StaffEditor`'s number input
is `?? ''` with an empty-string → `undefined` change handler (otherwise React
warns about a controlled/uncontrolled switch and the suite output stops being
pristine), and the roster table and `RailPanel` render `—` instead of `undefined`.

**Tests** — `roster-paste.test.js` (parser: no invented standardHours, middle-dot
cell; merge: Gardner's hours, Michaela's constraints, new-hire passthrough) and
`RosterScreen.test.jsx` (preview shows OVERWRITE + CREATE and applies nothing
until confirm; confirm preserves 25.5h and `maxDaysPerWeek: 3`).

- RED, 7 failures, including the finding's core claim verified verbatim:
  `expected { kind: 'shift', role: 'VA', …(2) } to match object { role: 'TECH_NC', …(1) }`
  — the Tech NC cell was silently becoming a coverage-counting VA.
  Also `expected { id: 'gardner-theresa', …(6) } to not have property "standardHours"`,
  `mergeStaffRecord is not a function` ×3, `Unable to find a label with the text of: Roster rows` ×2.
- GREEN: 7/7.

## SHOULD FIX 4 — `save()` resolves before the transaction commits

**Changed** — `src/state/persistence.js`

`run()` settled on the request, so a commit-time abort (quota, eviction) reported
success: no banner, stale state on reload. It now captures `request.result` in
`onsuccess` and settles on the transaction — `oncomplete` resolves, `onerror` and
`onabort` reject. `load()` still returns a value because `complete` fires after
`success`. Rejections carry a real `Error` when the browser supplies no
`tx.error` (an aborted transaction's `error` is `null`).

**Test** — `persistence.test.js` `rejects a save whose transaction aborts after the
write request succeeded`, which patches `IDBObjectStore.prototype.put` to abort
the transaction from the request's own success listener and restores the
prototype in `finally` (the round-trip tests share the file). This is a semantic
abort, not an event-ordering artifact.

- RED: `AssertionError: promise resolved "undefined" instead of rejecting`.
- GREEN: passes; the two existing round-trip tests still pass unchanged.

## SHOULD FIX 5 — `'Denied'` coerced to `'Pending'`

**Changed** — `src/import/paylocity.js`, `src/domain/timeoff.js`

`status: /^approved$/i.test(status) ? 'Approved' : 'Pending'` sent a denied row
into the decision queue as if it were awaiting a decision the manager had already
made. Statuses now map exactly via `STATUS = {approved, pending, denied}`; an
unrecognised one raises a new `unknown-status` issue with a human-readable
`detail` (ImportScreen renders `i.detail` verbatim) and no record, consistent with
how `bad-row` and `unknown-role` behave. `isApplied` returns false for `Denied`
regardless of any recorded `decision`, and the `TimeOffRequest` typedef gained the
third status.

**Tests** — `paylocity.test.js` `keeps Denied distinct from Pending and refuses to
guess unknown statuses`; `timeoff.test.js` `isApplied` Denied cases;
`store.test.js` `never queues or applies a Denied request` (queue unchanged, and
Carla's Wednesday shift is not turned into PTO).

- RED: `expected [ { …(9) }, { …(9) } ] to have a length of 1 but got 2` (the
  `Escalated` row was silently admitted as Pending) and `expected true to be
  false` (`isApplied` on a Denied row carrying `decision: 'granted'`).
- The store-level guard passed before the fix as well — `selectDecisionQueue`
  already filters on `status === 'Pending'`. It is kept as a regression guard for
  the "never enters selectDecisionQueue" half of the finding.
- GREEN: all.

## SHOULD FIX 6 — `adopt()` leaves stale actionable issue rows

**Changed** — `src/ui/ImportScreen.jsx`

`records.map` resolved every record matching the adopted name but
`issues.filter` removed only the clicked line, so duplicate rows for the same
unknown employee kept live "Use <name>" buttons for records already fixed.
Issues are now cleared by name (scoped to `unknown-employee`, so `bad-row` and
`unknown-status` entries survive), with a guard for a missing issue.

**Test** — `ImportScreen.test.jsx` `adopting a suggestion resolves every row for
that employee, leaving no dead button`, using two rows for the same fuzzy-matched
employee.

- RED: `AssertionError: expected <button type="button" …(1)></button> to be null`.
- GREEN: passes; one click clears both buttons and `Apply 2 requests` is offered.

---

## Verification

```
$ npx vitest run
 RUN  v4.1.10 /Users/hinchk/WestCoast.Vet/scheduler

 Test Files  26 passed (26)
      Tests  107 passed (107)
   Duration  2.16s (transform 1.07s, setup 1.92s, import 1.60s, tests 3.94s, environment 3.41s)
```

No stderr, no React warnings, no unhandled rejections — output pristine.
89 → 107 tests (+18).

### Blast radius of the absent `standardHours` (finding 3)

`grep -rn "standardHours" src/` — the only non-test, non-seed readers are
`metrics.hoursReport` (`.filter(s => s.standardHours > 0)`), `rules.undertime`
(`if (!staff.standardHours) continue`), `mergeStaffRecord`, and three UI render
sites now using `?? '—'` / `?? ''`. `suggestions.js`, `targets.js`, `coverage.js`
and `exporters.js` never read the field, so `isEligible` is not hours-aware and
there is no unguarded arithmetic path. Locked in by `store.test.js` `tolerates
staff with no standard hours set — silence, never NaN`, which puts a
standardHours-less staff member through `selectWeek` and `selectMonth` and
asserts no undertime violation for them and a finite `delta` on every hours row.

```
$ npm run build
vite v6.4.3 building for production...
✓ 58 modules transformed.
dist/index.html                   0.40 kB │ gzip:  0.27 kB
dist/assets/index-Cl8t1xvJ.css   26.78 kB │ gzip:  5.27 kB
dist/assets/index-CQQA3ZQJ.js   249.41 kB │ gzip: 77.72 kB
✓ built in 359ms
```

### Trust anchor

```
$ npx vitest run src/data/parity-aug02.test.js
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

All three parity assertions pass unchanged — the Proposed Schedule grid
cell-for-cell, the Coverage Check sheet, and the day statuses including
Thursday's OVER +1. `src/data/parity-aug02.test.js` was not edited, and
`git diff 47fc315 --stat -- src/data/` reports no changes at all, so neither the
fixtures nor the seed data moved to accommodate any fix.

```
$ npx vitest run src/domain/rules.test.js -t "exactly Gardner undertime"
 Test Files  1 passed (1)
      Tests  1 passed | 6 skipped (7)
```

The "no hard violations, and exactly Gardner undertime as soft" tripwire — the
guard that metrics never leak into Violations — still passes.

### Architecture

`src/domain`, `src/data` and `src/import` remain pure: `hoursPerDay` and
`mergeStaffRecord` are pure functions with no React, no clock, no id generation.
All components stay at module scope. No raw hex was introduced — the new banner
control and preview table use existing tokens (`danger`, `danger-soft`,
`amber-soft`, `amber-text`, `charcoal`, `primary`).

### Concerns

None blocking. Four judgement calls worth a reviewer's eye:

1. **`standardHours` may now be absent** on staff created by roster paste, rather
   than defaulting to a number. `undertime` and `hoursReport` both skip falsy
   standards, so an unknown standard produces silence rather than a false
   violation — the intended behaviour, but it means a newly pasted hire is
   invisible to the undertime rule until someone sets their hours in the editor.
   The roster table shows `—` to make that visible.
2. **An unrecognised Paylocity status skips the row** (reported as an issue)
   rather than importing it in some neutral state. This matches every other
   parser issue kind, and the row is visible in the preview's issue list, but it
   does mean the manager must fix the export or add the row by hand.
3. **A blank Notes cell in a roster paste still clears existing notes.** The
   prescribed merge is `constraints: {...existing, ...record.constraints}` and
   the parser emits `{ notes: notes || undefined }`, so an empty Notes column
   overwrites the stored note with `undefined`. Defensible — the sheet owns that
   column, and it is the one constraint key the sheet actually carries — but it
   is a data-overwrite path that survives the merge, unlike `maxDaysPerWeek` and
   friends. Worth a decision if pasted rows routinely omit notes.
4. The status gate uses `Object.hasOwn` rather than a bare lookup, so a Status
   cell reading `constructor` or `toString` raises `unknown-status` instead of
   resolving to an inherited function and passing the "never guess" check.
   Absurd input, but the gate's whole job is to not be fooled; covered by a case
   in the `keeps Denied distinct…` test.
